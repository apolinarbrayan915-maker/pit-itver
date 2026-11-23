"""
paso1_parser.py · Paso 1: Ingesta Curricular, Normalización y Anonimización
=============================================================================

¿CUÁL ES EL PROPÓSITO DE ESTE PASO?
-----------------------------------
Transformar el currículum del docente (en formato PDF, DOCX o TXT) en una
estructura de datos estandarizada (`CVProcesado`), limpia de sesgos y datos
sensibles, organizada en 4 dimensiones evaluables:
  1. EDUCACIÓN: Grados académicos, maestrías, doctorados e instituciones.
  2. PROYECTOS: Investigación aplicada, artículos, libros, asesorías técnicas.
  3. CERTIFICACIONES: Diplomados, cursos de actualización y certificaciones laborales.
  4. HABILIDADES: Materias impartidas, tecnologías y metodologías de enseñanza.

¿POR QUÉ SE ANONIMIZAN LOS DATOS PERSONALES? (LGPDPPSO Art. 3)
---------------------------------------------------------------
La Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados
exige que las instituciones públicas protejan la identidad y privacidad de los
titulares. Además, desde el punto de vista de Machine Learning e Inteligencia Artificial
responsable (Fair AI), eliminar la edad, género, fotografía, estado civil y datos de
contacto previene sesgos algorítmicos: el emparejamiento debe basarse estrictamente
en la competencia técnica y pedagógica del tutor, nunca en factores demográficos.

¿CÓMO FUNCIONA EL PROCESO?
--------------------------
  1. LECTURA: Extrae el texto íntegro preservando el flujo natural de lectura.
  2. ANONIMIZACIÓN: Detecta y reemplaza patrones de datos personales por etiquetas
     seguras como [DATO PROTEGIDO] y el nombre del tutor por [NOMBRE].
  3. SEGMENTACIÓN TECNM: Reconoce los encabezados oficiales de CVU-TECNM
     (Títulos académicos, Productividad académica, Asesor de proyectos, Diplomados,
     Cursos tomados, Materias impartidas) y agrupa las viñetas en las 4 dimensiones.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .catalogo import normalizar

# Las 4 dimensiones clave de evaluación multicriterio
SECCIONES = ("educacion", "proyectos", "certificaciones", "habilidades")
NOMBRES_SECCION = {
    "educacion": "EDUCACIÓN",
    "proyectos": "PROYECTOS",
    "certificaciones": "CERTIFICACIONES",
    "habilidades": "HABILIDADES",
}

# Encabezados reconocidos en español (minúsculas y sin acentos) mapeados a cada dimensión.
# Incluye soporte nativo para los formatos oficiales del CVU de TecNM y CVs estándar.
ALIAS_ENCABEZADOS = {
    "educacion": [
        "formacion academica", "educacion", "estudios", "grados academicos",
        "formacion", "escolaridad", "titulos academicos", "titulos",
        "licenciatura", "maestria", "doctorado",
    ],
    "proyectos": [
        "experiencia y proyectos", "proyectos", "experiencia profesional",
        "experiencia laboral", "experiencia", "trayectoria", "proyectos destacados",
        "investigacion", "asesor de proyectos", "productividad academica",
        "articulo", "articulos", "libro", "libros", "capitulo de libros",
        "capitulos de libros", "memoria de congresos", "memorias de congresos",
        "publicaciones", "publicaciones cientificas",
    ],
    "certificaciones": [
        "certificaciones y cursos", "certificaciones", "cursos", "diplomados",
        "cuenta con los diplomados de", "cursos tomados", "ha sido instructora de los cursos",
        "ha sido instructor de los cursos", "capacitacion", "certificados",
        "actualizacion docente", "reconocimientos",
    ],
    "habilidades": [
        "habilidades tecnicas", "habilidades", "competencias", "conocimientos",
        "herramientas", "tecnologias", "materias que imparte", "ha impartido materias",
        "ha impartido materias en las siguientes ingenierias", "lineas de investigacion",
        "aptitudes",
    ],
}


@dataclass
class CVProcesado:
    """
    Representación limpia y estructurada del currículum de un tutor.
    Contiene el texto categorizado por sección y la lista de datos personales removidos.
    """
    tutor_id: str
    secciones: dict[str, list[str]] = field(default_factory=dict)
    eliminados: list[str] = field(default_factory=list)  # Tipos de datos personales disociados

    def texto_unificado(self) -> str:
        """
        Concatena todas las secciones en un texto estandarizado con etiquetas claras.
        Permite vectorizaciones globales o inspección completa del tutor.
        """
        partes = []
        for s in SECCIONES:
            items = self.secciones.get(s, [])
            if items:
                partes.append(f"{NOMBRES_SECCION[s]}: " + " ".join(items))
        return "\n".join(partes)

    def fragmentos(self) -> list[tuple[str, str]]:
        """
        Devuelve una lista de tuplas (sección, texto_de_viñeta).
        Cada viñeta representa la unidad atómica de evidencia que será vectorizada
        por Sentence-BERT en el Paso 2 para sustentar las recomendaciones.
        """
        return [(s, it) for s in SECCIONES for it in self.secciones.get(s, [])]


# ==============================================================================
# 1. LECTURA DE DOCUMENTOS MULTIPLATAFORMA
# ==============================================================================
def leer_documento(ruta: Path) -> str:
    """
    Lee archivos en formato PDF, DOCX o TXT/MD respetando el flujo del texto.
    Lanza ValueError si el formato no es reconocido.
    """
    ext = ruta.suffix.lower()
    if ext == ".pdf":
        import pdfplumber
        with pdfplumber.open(ruta) as pdf:
            texto = "\n".join((p.extract_text() or "") for p in pdf.pages)
        # pdfplumber deja las viñetas sin glifo como "(cid:N)": se convierten en viñetas reales
        return re.sub(r"\(cid:\d+\)\s*", "\n• ", texto)
    if ext == ".docx":
        from docx import Document
        doc = Document(ruta)
        return "\n".join(p.text for p in doc.paragraphs)
    if ext in (".txt", ".md"):
        return ruta.read_text(encoding="utf-8", errors="replace")
    raise ValueError(f"Formato no soportado: {ext} (usa PDF, DOCX o TXT)")


# ==============================================================================
# 2. ANONIMIZACIÓN Y DISOCIACIÓN DE DATOS SENSIBLES (LGPDPPSO)
# ==============================================================================
# Expresiones regulares para detectar identificadores personales y oficiales
PATRONES_PII = [
    ("correo", re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")),
    ("url", re.compile(r"(https?://|www\.)\S+", re.I)),
    ("curp", re.compile(r"\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b")),
    ("rfc", re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b")),
    ("telefono", re.compile(r"(\+?52[\s-]?)?(\(?\d{2,3}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}\b")),
    ("fecha_nacimiento", re.compile(r"(fecha de nacimiento|nacid[oa] el)[^\n|]*", re.I)),
    ("datos_demograficos", re.compile(r"(pa[ií]s de nacimiento|g[eé]nero|sexo|estado civil|nacionalidad)[^\n|]*", re.I)),
    ("cedula_profesional", re.compile(r"\bcedula:?\s*\d+\b", re.I)),
    ("identificador_oficial", re.compile(r"\b(folio conocer|registro ante derechos de autor no\.?|curriculum:|miembro #)\s*[\w.-]+", re.I)),
    ("edad", re.compile(r"\b\d{2}\s*años de edad\b", re.I)),
]

LINEA_PERSONAL = re.compile(
    r"^\s*(domicilio|direcci[oó]n|tel[eé]fono|tel\.|celular|correo|e-?mail|curp|rfc|"
    r"estado civil|sexo|g[eé]nero|nacionalidad|edad|fecha de nacimiento|pa[ií]s de nacimiento|"
    r"cedula|folio conocer|foto|linkedin)\b",
    re.I,
)


def anonimizar(texto: str, nombre: str | None = None) -> tuple[str, list[str]]:
    """
    Remueve y censura datos personales antes de cualquier análisis semántico:
      - Elimina líneas completas dedicadas a datos de contacto/demográficos.
      - Reemplaza patrones en línea (correos, teléfonos, cédulas, URLs, etc.).
      - Oculta el nombre y variaciones del tutor para evitar sesgos por prestigio o identidad.
    """
    eliminados: list[str] = []
    lineas = []
    for ln in texto.splitlines():
        if LINEA_PERSONAL.match(ln):
            eliminados.append(LINEA_PERSONAL.match(ln).group(1).lower())
            continue
        lineas.append(ln)
    texto = "\n".join(lineas)

    for tipo, patron in PATRONES_PII:
        texto, n = patron.subn("[DATO PROTEGIDO]", texto)
        if n:
            eliminados.append(tipo)

    if nombre:
        # Se remueven prefijos de grado académico para identificar todas las combinaciones de nombre
        limpio = re.sub(r"^(dra?|m\.?\s?[a-z.]*|mtr[oa]|ing|lic)\.?\s+", "", nombre, flags=re.I)
        # Partículas como "del" no identifican a nadie y aparecen en todo el texto
        particulas = {"de", "del", "la", "las", "los", "san", "y"}
        piezas = [p for p in re.split(r"\s+", limpio) if len(p) > 2 and p.lower() not in particulas]
        candidatos = [limpio] + [" ".join(piezas[i:i + 2]) for i in range(len(piezas) - 1)] + piezas
        for c in candidatos:
            # Solo palabras completas: "del" dentro de "modelo" no es un nombre
            texto, n = re.subn(rf"(?<!\w){re.escape(c)}(?!\w)", "[NOMBRE]", texto, flags=re.I)
            if n and "nombre" not in eliminados:
                eliminados.append("nombre")

    return texto, sorted(set(eliminados))


# ==============================================================================
# 3. SEGMENTACIÓN CURRICULAR INTELIGENTE
# ==============================================================================
def _es_encabezado(linea: str) -> str | None:
    """
    Determina si una línea corresponde a un encabezado de sección reconocido.
    Retorna la clave de la sección ('educacion', 'proyectos', etc.) o None.
    Las líneas con viñetas nunca se consideran encabezados.
    """
    if linea.lstrip().startswith(("-", "•", "*", "▪", "·", "–")):
        return None  # Las viñetas son contenido, nunca encabezados de sección

    t = normalizar(linea).strip(" :-•*#\t")
    if not t or len(t) > 55:
        return None
    for seccion, alias in ALIAS_ENCABEZADOS.items():
        if t in alias or t.rstrip(":") in alias:
            return seccion
        # Títulos con sufijo breve (ej. 'cursos tomados, entre otros')
        if any(t.startswith(a) and len(t) - len(a) < 25 for a in alias if len(a) > 6):
            return seccion
    return None


def _clasificar_parrafo_resumen(parrafo: str) -> str:
    """
    En los CVU del TecNM, la sección 'Resumen biográfico' condensa múltiples facetas.
    Esta función clasifica cada párrafo del resumen en la dimensión que mejor lo respalda.
    """
    p_norm = normalizar(parrafo)
    if any(k in p_norm for k in ("doctora", "doctorado", "maestria", "licenciatura", "egresada", "ingenieria en sistemas")):
        return "educacion"
    if any(k in p_norm for k in ("articulos", "publicaciones", "congresos", "redes de investigacion", "ieee", "proyectos", "investigacion", "xai")):
        return "proyectos"
    if any(k in p_norm for k in ("certific", "diplomad", "ingles", "curso")):
        return "certificaciones"
    return "habilidades"


def segmentar(texto: str) -> dict[str, list[str]]:
    """
    Divide el texto del CV en los 4 bloques curriculares.
    Maneja viñetas, líneas partidas por el salto de página en PDF y resúmenes biográficos.
    """
    secciones: dict[str, list[str]] = {s: [] for s in SECCIONES}
    actual: str | None = None
    en_resumen_biografico = False

    for crudo in texto.splitlines():
        ln = crudo.strip()
        if not ln:
            continue

        # Detección de encabezado oficial
        t_norm = normalizar(ln).strip(" :-•*#\t")
        if t_norm.startswith("resumen biografico"):
            en_resumen_biografico = True
            actual = None
            continue

        enc = _es_encabezado(ln)
        if enc:
            en_resumen_biografico = False
            actual = enc
            continue

        # Manejo de contenido dentro de 'Resumen biográfico'
        if en_resumen_biografico:
            sec_destino = _clasificar_parrafo_resumen(ln)
            secciones[sec_destino].append(ln)
            continue

        if actual is None:
            # Texto antes de la primera sección (títulos de cabecera o logos)
            continue

        # Procesamiento de viñetas y unión de líneas rotas por salto de página en PDF
        es_vineta = bool(re.match(r"^[-•*▪·]\s+", ln))
        ln = re.sub(r"^[-•*▪·]\s+", "", ln)
        items = secciones[actual]

        if items and not es_vineta and not items[-1].rstrip().endswith((".", ")", ":")):
            items[-1] = f"{items[-1]} {ln}"
        else:
            items.append(ln)

    # Limpieza final: normalizar espacios y descartar fragmentos espurios
    for s in SECCIONES:
        secciones[s] = [
            re.sub(r"\s+", " ", x).strip()
            for x in secciones[s]
            if len(x.strip()) > 3 and not x.strip().startswith("[DATO PROTEGIDO]")
        ]

    return secciones


def procesar_cv(ruta: Path, tutor_id: str, nombre: str | None = None) -> CVProcesado:
    """
    Punto de entrada principal del Paso 1:
      1. Lee el archivo fuente.
      2. Anonimiza datos sensibles.
      3. Segmenta en las 4 dimensiones curriculares.
    """
    crudo = leer_documento(ruta)
    limpio, eliminados = anonimizar(crudo, nombre)
    return CVProcesado(
        tutor_id=tutor_id,
        secciones=segmentar(limpio),
        eliminados=eliminados,
    )
