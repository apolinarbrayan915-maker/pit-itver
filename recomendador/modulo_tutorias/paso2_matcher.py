"""
paso2_matcher.py · Paso 2: Motor Semántico y Espacio Vectorial (Sentence-BERT)
==============================================================================

¿CUÁL ES EL PROPÓSITO DE ESTE PASO?
-----------------------------------
Transformar las dudas de los estudiantes y los fragmentos curriculares de los
profesores en vectores numéricos dentro de un espacio continuo de 384 dimensiones.
Esto permite medir qué tan parecidos son en significado, sin depender de que usen
las mismas palabras literales.

¿POR QUÉ SENTENCE-BERT Y NO BÚSQUEDA TRADICIONAL POR PALABRAS CLAVE (TF-IDF/ATS)?
---------------------------------------------------------------------------------
Los sistemas tradicionales de reclutamiento (ATS) buscan palabras exactas. Por ejemplo:
  - Duda: "Quiero entrenar un modelo que prediga qué alumnos van a reprobar".
  - CV:   "Minería de datos y modelos predictivos en educación superior".
Si buscamos coincidencias textuales ("entrenar", "alumnos", "reprobar"), el sistema
diría que no coinciden (similitud 0). En contraste, Sentence-BERT (SBERT) comprende
que "predecir alumnos que van a reprobar" y "modelos predictivos en educación"
comparten el mismo concepto semántico en el espacio latente.

¿CÓMO SE MIDE LA SIMILITUD? (SIMILITUD COSENO)
----------------------------------------------
La similitud entre dos vectores u y v se calcula mediante el coseno del ángulo θ
que forman en el espacio multidimensional:

    cos(θ) = (u · v) / (‖u‖ · ‖v‖)

Dado que todos los vectores generados por el modelo se NORMALIZAN a norma unitaria (‖u‖ = 1),
la fórmula se simplifica al producto punto matricial directo:
    cos(θ) = u · v
Esto permite evaluar cientos de comparaciones en pocos microsegundos usando operaciones
vectorizadas de NumPy en CPU.

¿POR QUÉ CACHÉ .NPZ?
--------------------
La inferencia de una red neuronal es computacionalmente costosa. Por ello, una vez
calculados los embeddings de los CVs oficiales, se guardan en un archivo binario
comprimido (`data/cache/embeddings_<hash>.npz`). Al reiniciar la aplicación, los
vectores se cargan instantáneamente en memoria.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

import numpy as np

from . import config
from .paso1_parser import CVProcesado


@dataclass
class IndiceTutor:
    """
    Índice semántico en memoria para un tutor:
      - tutor_id: Identificador institucional (ej. 'T01', 'T02').
      - fragmentos: Lista de tuplas (sección, texto) para trazabilidad.
      - vectores: Matriz (N, 384) con los embeddings de cada viñeta.
      - centroide: Vector medio (384,) que resume el perfil global del tutor.
    """
    tutor_id: str
    fragmentos: list[tuple[str, str]]
    vectores: np.ndarray
    centroide: np.ndarray


class MotorSemantico:
    """
    Motor encargado de la carga de la red neuronal, vectorización de textos
    y cálculo de similitudes semánticas vectorizadas.
    """

    def __init__(self, nombre_modelo: str = config.MODELO_SBERT):
        from sentence_transformers import SentenceTransformer
        self.nombre_modelo = nombre_modelo
        # Intenta cargar los pesos desde la caché local sin requerir conexión a internet
        try:
            self.modelo = SentenceTransformer(nombre_modelo, device="cpu", local_files_only=True)
        except Exception:
            self.modelo = SentenceTransformer(nombre_modelo, device="cpu")
        self.indice: dict[str, IndiceTutor] = {}

    # ==========================================================================
    # GENERACIÓN DE EMBEDDINGS
    # ==========================================================================
    def vectorizar(self, textos: list[str]) -> np.ndarray:
        """
        Pasa una lista de textos por la red neuronal y devuelve una matriz NumPy (N, 384)
        con embeddings normalizados (longitud = 1.0).
        """
        return self.modelo.encode(
            textos,
            normalize_embeddings=True,
            convert_to_numpy=True,
            batch_size=32,
            show_progress_bar=False,
        ).astype(np.float32)

    @property
    def dimensiones(self) -> int:
        """Retorna la dimensionalidad de los vectores (384)."""
        f = getattr(self.modelo, "get_embedding_dimension", None) or self.modelo.get_sentence_embedding_dimension
        return int(f())

    # ==========================================================================
    # INDEXACIÓN Y CACHÉ
    # ==========================================================================
    def _clave_cache(self, cvs: list[CVProcesado]) -> str:
        """
        Genera una firma SHA-256 única basada en el contenido de los CVs procesados
        y el modelo de lenguaje. Si algún CV cambia, la clave cambia automáticamente.
        """
        h = hashlib.sha256(f"v2|{self.nombre_modelo}".encode())
        for cv in cvs:
            h.update(cv.tutor_id.encode())
            h.update(json.dumps(cv.fragmentos(), ensure_ascii=False).encode())
        return h.hexdigest()[:16]

    def indexar(self, cvs: list[CVProcesado]) -> None:
        """
        Indexa todos los CVs. Si ya existe la caché binaria .npz, la reutiliza.
        De lo contrario, calcula los embeddings y guarda el archivo comprimido.
        """
        config.DIR_CACHE.mkdir(parents=True, exist_ok=True)
        ruta = config.DIR_CACHE / f"embeddings_{self._clave_cache(cvs)}.npz"
        textos = [txt for cv in cvs for _, txt in cv.fragmentos()]

        if ruta.exists():
            todos = np.load(ruta)["v"]
        else:
            todos = self.vectorizar(textos)
            # Limpiar versiones obsoletas de la caché
            for viejo in config.DIR_CACHE.glob("embeddings_*.npz"):
                viejo.unlink()
            np.savez_compressed(ruta, v=todos)

        self.indice.clear()
        i = 0
        for cv in cvs:
            frs = cv.fragmentos()
            v = todos[i:i + len(frs)]
            i += len(frs)
            c = v.mean(axis=0)
            # El centroide también se normaliza a norma unitaria
            centroide_norm = c / (np.linalg.norm(c) + 1e-12)
            self.indice[cv.tutor_id] = IndiceTutor(cv.tutor_id, frs, v, centroide_norm)

    # ==========================================================================
    # CÁLCULO DE SIMILITUD COSENO
    # ==========================================================================
    @staticmethod
    def coseno(u: np.ndarray, v: np.ndarray) -> float:
        """Calcula el coseno entre dos vectores numéricos."""
        return float(np.dot(u, v) / ((np.linalg.norm(u) * np.linalg.norm(v)) + 1e-12))

    def similitudes(self, vector_consulta: np.ndarray) -> dict[str, dict]:
        """
        Calcula la afinidad de la duda del alumno contra cada tutor:
          - 'perfil': Similitud global contra el centroide del tutor.
          - 'fragmentos': Array con la similitud contra cada viñeta individual del CV.
        """
        out = {}
        for tid, ind in self.indice.items():
            out[tid] = {
                "perfil": float(ind.centroide @ vector_consulta),
                "fragmentos": ind.vectores @ vector_consulta,
            }
        return out
