"""
config.py · Configuración, Hiperparámetros y Pesos Multicriterio
===============================================================

¿CUÁL ES EL PROPÓSITO DE ESTE ARCHIVO?
---------------------------------------
Centralizar todas las rutas del sistema y los parámetros matemáticos del
modelo de emparejamiento. Permite calibrar la sensibilidad del algoritmo sin
modificar el código lógico de los pasos 1 al 5.

¿QUÉ REPRESENTA CADA PARÁMETRO?
-------------------------------
  · MODELO_SBERT:
      Sentence-BERT ('paraphrase-multilingual-MiniLM-L12-v2'). Es una red neuronal
      de lenguaje multilingüe pre-entrenada para generar representaciones densas de
      384 dimensiones. Captura significado semántico en español independientemente
      de la sintaxis o palabras exactas utilizadas.

  · PESOS MULTICRITERIO (MCDM - Multi-Criteria Decision Making):
      Define la ponderación de las tres dimensiones de competencia del tutor:
        - sem (45%): Afinidad temática global entre la duda y los textos del CV.
        - proj (35%): Experiencia comprobada en proyectos, investigación y asesorías.
        - cert (20%): Acreditación formal (cursos, diplomados y certificaciones oficiales).
      La suma debe ser estrictamente 1.0 (normalización convexa).

  · COS_MIN (0.10) y COS_MAX (0.75):
      Rango de calibración para la normalización minimax:
          S_norm = clip((cos - COS_MIN) / (COS_MAX - COS_MIN), 0, 1)
      En el espacio vectorial de este modelo, textos no relacionados suelen rondar
      un coseno de 0.10, mientras que formulaciones altamente afines alcanzan ~0.75.
      Esta transformación mapea la similitud a un porcentaje intuitivo del 0% al 100%.

  · UMBRAL_AFINIDAD (τ = 0.40):
      Punto de corte para el ranking directo. Si al menos un tutor obtiene Score >= 0.40,
      el sistema activa el modo 'ranking'. Si ningún tutor alcanza 0.40, se activa la
      regla de negocio 'Fallback Formativo' (nunca un rechazo estéril).

  · UMBRALES DE DOMINIO DE CONCEPTOS (Matriz de Brechas):
      - UMBRAL_CONCEPTO_DOMINA (0.55): Coseno necesario para calificar como 'Domina'.
      - UMBRAL_CONCEPTO_PARCIAL (0.40): Coseno para calificar como 'Parcial'.
      Por debajo de 0.40 se califica como 'No domina'.
"""
from pathlib import Path

# Rutas del sistema
RAIZ = Path(__file__).resolve().parents[1]
DIR_DATA = RAIZ / "data"
DIR_CVS = DIR_DATA / "cvs"
ARCHIVO_TUTORES = DIR_DATA / "tutores.json"
ARCHIVO_PROGRAMAS = DIR_DATA / "programas_nivelacion.json"
DIR_CACHE = DIR_DATA / "cache"
BD_SQLITE = DIR_DATA / "tutorias.db"

# Modelo de embeddings de Sentence-BERT (384 dimensiones)
MODELO_SBERT = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

# Ponderación multicriterio (suma = 1.0)
PESOS = {
    "sem": 0.45,   # Afinidad semántica general
    "proj": 0.35,  # Evidencia en proyectos reales y publicaciones
    "cert": 0.20,  # Certificaciones y diplomados oficiales
}

# Límites empíricos de similitud coseno para normalizar al rango [0, 1]
COS_MIN = 0.10
COS_MAX = 0.75

# Umbral de afinidad institucional (τ)
UMBRAL_AFINIDAD = 0.40

# Umbrales para clasificación en la Matriz de Brechas
UMBRAL_CONCEPTO_DOMINA = 0.55
UMBRAL_CONCEPTO_PARCIAL = 0.40

# Número máximo de candidatos sugeridos en el ranking
TOP_K = 3

# Verificación de integridad matemática de los pesos
assert abs(sum(PESOS.values()) - 1.0) < 1e-9, "Los pesos multicriterio deben sumar exactamente 1.0"
