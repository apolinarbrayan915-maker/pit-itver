"""
paso3_classifier.py · Paso 3: Clasificador Multicriterio (MCDM) y Regla de Fallback
===================================================================================

¿CUÁL ES EL PROPÓSITO DE ESTE PASO?
-----------------------------------
Evaluar a los tutores mediante un modelo de decisión multicriterio objetivo,
transparente y auditable, combinando tres dimensiones de competencia:

    Score = 0.45 · S_sem  +  0.35 · S_proj  +  0.20 · S_cert

¿QUÉ SIGNIFICA CADA COMPONENTE DE LA FÓRMULA?
---------------------------------------------
  1. S_sem (45% - Afinidad Semántica Global):
     Promedio de similitud de los 3 fragmentos curriculares del tutor más afines
     a la duda del estudiante. Garantiza que el perfil general del tutor sea compatible.

  2. S_proj (35% - Evidencia en Proyectos y Publicaciones):
     Promedio de los 2 proyectos, artículos o libros más cercanos. Asegura que el
     docente tenga experiencia práctica o aplicada comprobable en el tema.

  3. S_cert (20% - Acreditación Formal):
     Puntaje del curso, diplomado o certificación más afín. Valida el respaldo formal
     e institucional del conocimiento.

¿POR QUÉ LA NORMALIZACIÓN MINIMAX [COS_MIN, COS_MAX]?
------------------------------------------------------
Los cosenos crudos calculados por modelos Transformer difícilmente llegan a 1.0 o 0.0:
textos no relacionados suelen dar ~0.10 y textos casi idénticos ~0.75.
Para que los resultados sean interpretables como porcentajes reales de afinidad (0% a 100%),
se aplica una escala minimax acotada:
    S_norm = clip((coseno_crudo - 0.10) / (0.75 - 0.10), 0.0, 1.0)

REGLA DE NEGOCIO FUNDAMENTAL: "NUNCA UN RECHAZO ESTÉRIL"
--------------------------------------------------------
Un sistema educativo nunca debe responder a un estudiante con un mensaje de error
frustrante como "No hay resultados para tu búsqueda". En su lugar:

  · SI ALGÚN TUTOR ALCANZA EL UMBRAL (Score >= τ = 0.40):
      -> Modo 'RANKING': Se ordena y presenta a los mejores tutores recomendados,
         acompañados de su disponibilidad de cupo y horario.

  · SI NINGÚN TUTOR ALCANZA EL UMBRAL (Score < τ):
      -> Modo 'FALLBACK FORMATIVO':
         1. Se asigna al tutor DISPONIBLE más cercano temáticamente (para que el alumno
            cuente con un guía humano y no quede desatendido).
         2. Se genera la MATRIZ DE BRECHAS: un desglose transparente que indica qué
            conceptos el tutor "Domina", cuáles cubre de forma "Parcial" y cuáles "No domina".
         3. Se recomiendan PROGRAMAS DE NIVELACIÓN institucional (cursos sugeridos)
            para que el estudiante pueda solventar los conocimientos faltantes.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field

import numpy as np

from . import catalogo, config
from .paso1_parser import CVProcesado
from .paso2_matcher import MotorSemantico


def normalizar_coseno(c: float) -> float:
    """
    Escala la similitud coseno cruda al rango [0.0, 1.0].
    Valores <= COS_MIN (0.10) se convierten en 0.0; valores >= COS_MAX (0.75) en 1.0.
    """
    return float(np.clip((c - config.COS_MIN) / (config.COS_MAX - config.COS_MIN), 0.0, 1.0))


@dataclass
class Evidencia:
    """Evidencia concreta extraída del CV del tutor que respalda la recomendación."""
    seccion: str
    texto: str
    similitud: float  # Coseno crudo


@dataclass
class FilaBrecha:
    """
    Fila de la Matriz de Brechas para un concepto de la duda del estudiante:
      - concepto: Nombre legible del tema (ej. 'Diseño UX').
      - estado: 'Domina' | 'Parcial' | 'No domina'.
      - similitud: Puntuación de afinidad con el CV.
      - evidencia: Cita textual del CV que lo sustenta (si existe).
      - tutor_alternativo: Nombre de otro docente de la academia que sí domine el tema.
    """
    concepto: str
    estado: str
    similitud: float
    evidencia: str | None
    tecnologias_faltantes: list[str] = field(default_factory=list)
    tutor_alternativo: str | None = None
    tutor_alternativo_id: str | None = None


@dataclass
class Candidato:
    """Información completa y desglosada de un tutor evaluado."""
    tutor_id: str
    nombre: str
    s_sem: float        # Afinidad semántica normalizada [0, 1]
    s_proj: float       # Evidencia en proyectos normalizada [0, 1]
    s_cert: float       # Acreditación normalizada [0, 1]
    score: float        # Puntuación final ponderada MCDM [0, 1]
    cruda: dict         # Cosenos crudos antes de normalizar
    evidencias: list[Evidencia]
    cupo_disponible: bool
    horario: list[str]
    cubiculo: str
    correo: str
    coincide_dia: bool | None = None
    brechas: list[FilaBrecha] = field(default_factory=list)


@dataclass
class Resultado:
    """Resultado institucional devuelto tras la evaluación de una duda."""
    consulta: str
    modo: str                        # 'ranking' o 'fallback'
    umbral: float                    # Umbral de corte τ aplicado
    pesos: dict                      # Ponderaciones usadas en MCDM
    candidatos: list[Candidato]      # Tutores recomendados
    todos: list[dict]                # Puntuación de todos los tutores para auditoría
    conceptos_detectados: list[str]  # Conceptos clave identificados
    programas_sugeridos: list[dict] = field(default_factory=list)

    def a_dict(self) -> dict:
        """Serializa el resultado a diccionario para almacenamiento o respuestas API."""
        return asdict(self)


class Clasificador:
    """
    Clasificador multicriterio que implementa la fórmula MCDM y la regla de fallback.
    """

    def __init__(self, motor: MotorSemantico, cvs: list[CVProcesado], tutores: list[dict]):
        self.motor = motor
        self.cvs = {cv.tutor_id: cv for cv in cvs}
        self.tutores = {t["id"]: t for t in tutores}
        try:
            self.programas = json.loads(config.ARCHIVO_PROGRAMAS.read_text(encoding="utf-8"))
        except FileNotFoundError:
            self.programas = []

    # ==========================================================================
    # CÁLCULO DE PUNTAJES POR COMPONENTE
    # ==========================================================================
    def _puntajes(self, sims: dict) -> dict:
        """
        Extrae las puntuaciones crudas para cada tutor:
          - 'sem': Promedio de las 3 mejores viñetas de cualquier sección.
          - 'proj': Promedio de las 2 mejores viñetas de la sección 'proyectos'.
          - 'cert': La mejor viñeta de la sección 'certificaciones'.
        """
        out = {}
        for tid, s in sims.items():
            ind = self.motor.indice[tid]
            fr = s["fragmentos"]
            secs = np.array([sec for sec, _ in ind.fragmentos])

            # 1. Semántico global: top 3 general
            top3 = np.partition(fr, -min(3, len(fr)))[-min(3, len(fr)):] if len(fr) else [0.0]
            s_sem = float(np.mean(top3))
            fr_cv = fr[secs != "materias_reportadas"]
            k_cv = min(3, len(fr_cv))
            s_sem_cv = float(np.mean(np.partition(fr_cv, -k_cv)[-k_cv:])) if k_cv else 0.0

            # 2. Proyectos: top 2 de la sección 'proyectos'
            m_proj = (secs == "proyectos")
            if m_proj.any():
                fp = fr[m_proj]
                top2_p = np.partition(fp, -min(2, len(fp)))[-min(2, len(fp)):]
                s_proj = float(np.mean(top2_p))
            else:
                s_proj = s_sem_cv * 0.7  # Penalización basada solo en el CV

            # 3. Certificaciones: top 1 de la sección 'certificaciones'
            m_cert = (secs == "certificaciones")
            if m_cert.any():
                s_cert = float(np.max(fr[m_cert]))
            else:
                s_cert = s_sem_cv * 0.6  # Penalización basada solo en el CV

            out[tid] = {"sem": s_sem, "proj": s_proj, "cert": s_cert}
        return out

    def _evidencias(self, tid: str, fragmentos_sim: np.ndarray, n: int = 4) -> list[Evidencia]:
        """Selecciona las viñetas más afines del CV para citarlas en la explicación al alumno."""
        ind = self.motor.indice[tid]
        k = min(n, len(ind.fragmentos))
        if k == 0:
            return []
        idx = np.argpartition(fragmentos_sim, -k)[-k:]
        idx = idx[np.argsort(-fragmentos_sim[idx])]
        return [Evidencia(ind.fragmentos[i][0], ind.fragmentos[i][1], float(fragmentos_sim[i])) for i in idx]

    # ==========================================================================
    # MATRIZ DE BRECHAS Y PROGRAMAS DE NIVELACIÓN
    # ==========================================================================
    def _conceptos(self, consulta: str) -> list[tuple[str, str, list[str]]]:
        """Detecta conceptos en la consulta mediante catálogo o división en frases."""
        claves = catalogo.detectar_conceptos(consulta)
        if claves:
            return [(k, catalogo.etiqueta(k), catalogo.terminos_encontrados(consulta, k)) for k in claves]
        # Si la duda no coincide con el catálogo, divide la frase en proposiciones
        frases = [p.strip() for p in re.split(r",| y | o | pero | que ", consulta) if len(p.strip()) > 8]
        return [(f"frase_{i}", f, []) for i, f in enumerate(frases[:4] or [consulta])]

    def matriz_brechas(self, consulta: str, tid: str) -> list[FilaBrecha]:
        """
        Genera la Matriz de Brechas para el tutor asignado:
        Compara cada concepto de la duda contra los fragmentos curriculares del profesor
        y clasifica si Domina (>= 0.55), Parcial (0.40 - 0.55) o No domina (< 0.40).
        """
        conceptos = self._conceptos(consulta)
        if not conceptos:
            return []
        textos = [f"{etq}: {' '.join(terms)}".strip(": ") for _, etq, terms in conceptos]
        vecs = self.motor.vectorizar(textos)
        cv_norm = " " + catalogo.normalizar(self.cvs[tid].texto_unificado()) + " "
        filas = []

        for (clave, etq, terms), v in zip(conceptos, vecs):
            ind = self.motor.indice[tid]
            sims = ind.vectores @ v
            j = int(np.argmax(sims))
            sim = float(sims[j])
            literal = clave in catalogo.CONCEPTOS and any(
                catalogo._contiene(cv_norm, s) for s in catalogo.CONCEPTOS[clave][1]
            )
            faltantes = [t for t in terms if not catalogo._contiene(cv_norm, t)]

            if sim >= config.UMBRAL_CONCEPTO_DOMINA or (literal and sim >= config.UMBRAL_CONCEPTO_PARCIAL):
                estado = "Domina"
            elif literal or sim >= config.UMBRAL_CONCEPTO_PARCIAL:
                estado = "Parcial"
            else:
                estado = "No domina"

            fila = FilaBrecha(
                concepto=etq,
                estado=estado,
                similitud=round(sim, 3),
                evidencia=ind.fragmentos[j][1] if estado != "No domina" else None,
                tecnologias_faltantes=faltantes,
            )

            # Si el tutor actual no domina el concepto, se busca si otro profesor sí lo cubre
            if estado != "Domina":
                alt = self._mejor_tutor_para(v, excluir=tid)
                if alt:
                    fila.tutor_alternativo_id = alt
                    fila.tutor_alternativo = self.tutores[alt]["nombre"]
            filas.append(fila)

        return filas

    def _mejor_tutor_para(self, v: np.ndarray, excluir: str) -> str | None:
        """Encuentra qué otro docente de la academia tiene mayor afinidad con este vector."""
        mejor, mejor_sim = None, config.UMBRAL_CONCEPTO_DOMINA
        for tid, ind in self.motor.indice.items():
            if tid == excluir or tid not in self.tutores:
                continue
            s = float((ind.vectores @ v).max())
            if s >= mejor_sim:
                mejor, mejor_sim = tid, s
        return mejor

    def _programas(self, claves: list[str], brechas: list[FilaBrecha]) -> list[dict]:
        """Asocia programas y cursos de nivelación basados en las áreas de brecha."""
        sugeridos = []
        for p in self.programas:
            areas = set(p.get("areas", []))
            if areas & set(claves) or p.get("general"):
                sugeridos.append(p)
        return sugeridos

    # ==========================================================================
    # PROCESO COMPLETO DE EMPAREJAMIENTO
    # ==========================================================================
    def emparejar(self, consulta: str, dia_preferido: str | None = None,
                  top_k: int = config.TOP_K) -> Resultado:
        """
        Ejecuta el pipeline de evaluación:
          1. Vectoriza la consulta del estudiante.
          2. Calcula similitudes contra todos los tutores.
          3. Aplica la fórmula multicriterio MCDM ponderada.
          4. Decide entre modo 'ranking' o 'fallback formativo'.
        """
        consulta = consulta.strip()
        vq = self.motor.vectorizar([consulta])[0]
        sims = {tid: sim for tid, sim in self.motor.similitudes(vq).items()
                if tid in self.tutores}
        crudos = self._puntajes(sims)

        candidatos: list[Candidato] = []
        for tid, c in crudos.items():
            t = self.tutores[tid]
            # Normalización individual de cada componente al rango [0, 1]
            s_sem = normalizar_coseno(c["sem"])
            s_proj = normalizar_coseno(c["proj"])
            s_cert = normalizar_coseno(c["cert"])

            # Ponderación multicriterio MCDM
            score = (
                config.PESOS["sem"] * s_sem +
                config.PESOS["proj"] * s_proj +
                config.PESOS["cert"] * s_cert
            )

            dia = None
            if dia_preferido:
                dia = any(h.lower().startswith(dia_preferido.lower()) for h in t["horario"])

            candidatos.append(Candidato(
                tutor_id=tid,
                nombre=t["nombre"],
                s_sem=round(s_sem, 3),
                s_proj=round(s_proj, 3),
                s_cert=round(s_cert, 3),
                score=round(score, 3),
                cruda={k: round(v, 3) for k, v in c.items()},
                evidencias=self._evidencias(tid, sims[tid]["fragmentos"]),
                cupo_disponible=t["tutorados_actuales"] < t["capacidad"],
                horario=t["horario"],
                cubiculo=t["cubiculo"],
                correo=t["correo"],
                coincide_dia=dia,
            ))

        # Ordenar candidatos de mayor a menor score
        candidatos.sort(key=lambda c: -c.score)
        todos = [
            {"tutor_id": c.tutor_id, "nombre": c.nombre, "score": c.score,
             "s_sem": c.s_sem, "s_proj": c.s_proj, "s_cert": c.s_cert}
            for c in candidatos
        ]
        claves = catalogo.detectar_conceptos(consulta)

        # Regla de corte institucional: Score >= UMBRAL_AFINIDAD (0.40)
        aprobados = [c for c in candidatos if c.score >= config.UMBRAL_AFINIDAD]
        if aprobados:
            elegidos = aprobados[:top_k]
            for c in elegidos:
                c.brechas = self.matriz_brechas(consulta, c.tutor_id)
            return Resultado(
                consulta=consulta,
                modo="ranking",
                umbral=config.UMBRAL_AFINIDAD,
                pesos=config.PESOS,
                candidatos=elegidos,
                todos=todos,
                conceptos_detectados=[catalogo.etiqueta(k) for k in claves],
            )

        # Regla de Fallback Formativo: Seleccionar al tutor DISPONIBLE con mayor cercanía
        disponibles = [c for c in candidatos if c.cupo_disponible] or candidatos
        cercano = disponibles[0]
        cercano.brechas = self.matriz_brechas(consulta, cercano.tutor_id)
        return Resultado(
            consulta=consulta,
            modo="fallback",
            umbral=config.UMBRAL_AFINIDAD,
            pesos=config.PESOS,
            candidatos=[cercano],
            todos=todos,
            conceptos_detectados=[catalogo.etiqueta(k) for k in claves],
            programas_sugeridos=self._programas(claves, cercano.brechas),
        )
