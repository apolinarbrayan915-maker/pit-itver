"""
catalogo.py · Catálogo de Conceptos Curriculares para Explicabilidad y Brechas
=============================================================================

¿CUÁL ES EL PROPÓSITO DE ESTE CATÁLOGO?
---------------------------------------
Este catálogo define las competencias y temas clave de la carrera de Ingeniería
en Sistemas Computacionales (y posgrados afines) del TecNM.

¡IMPORTANTE! ¿POR QUÉ EL EMPAREJAMIENTO NO DEPENDE DE ESTE CATÁLOGO?
---------------------------------------------------------------------
El emparejamiento principal entre el estudiante y el tutor es SEMÁNTICO-NEURONAL
(usando Sentence-BERT en el Paso 2). Si un estudiante escribe:
  "Tengo problemas para que mi app guarde los datos en el teléfono"
Sentence-BERT sabrá que se refiere a desarrollo móvil y almacenamiento local aunque
no use palabras exactas del diccionario.

Este catálogo se utiliza EXCLUSIVAMENTE para dos fines de transparencia (XAI):
  1. DETECCIÓN LÉXICA: Identificar qué temas concretos nombró el estudiante.
  2. MATRIZ DE BRECHAS: Generar el informe de qué competencias cubre o no cubre el
     tutor asignado (Domina / Parcial / No domina) y qué tecnologías faltan.

ESTRUCTURA DE CADA ELEMENTO:
----------------------------
  clave: (Nombre legible para el alumno, [lista de sinónimos y términos en minúsculas sin acentos])
"""
from __future__ import annotations

import re
import unicodedata

CONCEPTOS: dict[str, tuple[str, list[str]]] = {
    # -------------------------------------------------- Programación y Algoritmos
    "logica_prog": (
        "Lógica y fundamentos de programación",
        ["fundamentos de programacion", "logica de programacion", "diagrama de flujo",
         "diagramas de flujo", "pseudocodigo", "ciclos", "bucles", "condicionales",
         "arreglos", "funciones", "variables", "pseint"],
    ),
    "c_cpp": (
        "Lenguaje C / C++ y programación estructurada",
        ["c++", "cpp", "lenguaje c", "en c ", "programacion en c", "c estructurado"],
    ),
    "python": (
        "Python",
        ["python", "pandas", "numpy", "django", "flask"],
    ),
    "java": (
        "Java y Programación Orientada a Objetos",
        ["java", "spring", "junit", "orientada a objetos", "poo", "clases", "herencia", "polimorfismo"],
    ),
    "csharp": (
        "C# y plataforma .NET",
        ["c#", "csharp", ".net"],
    ),
    "javascript": (
        "JavaScript y desarrollo web",
        ["javascript", "js", "typescript", "node", "nodejs", "node.js", "react", "html", "css"],
    ),
    "estructuras_datos": (
        "Estructuras de datos y algoritmos",
        ["estructura de datos", "estructuras de datos", "pilas", "colas", "listas enlazadas",
         "arboles", "grafos", "recursividad", "algoritmos", "ordenamiento", "complejidad", "dijkstra"],
    ),

    # -------------------------------------------------- Interacción, UX e Interfaces
    "ux": (
        "Diseño UX / Experiencia de usuario y usabilidad",
        ["ux", "ui", "experiencia de usuario", "usabilidad", "figma", "interfaz de usuario",
         "humano-computadora", "diseno centrado en el usuario", "google ux", "prototipado"],
    ),

    # -------------------------------------------------- Inteligencia Artificial y Datos
    "ia": (
        "Inteligencia Artificial y modelos inteligentes",
        ["inteligencia artificial", " ia ", "ia,", "agentes inteligentes", "ia aplicada"],
    ),
    "machine_learning": (
        "Aprendizaje automático y ciencia de datos",
        ["machine learning", "aprendizaje automatico", "scikit-learn", "sklearn",
         "modelo predictivo", "clasificador", "random forest", "entrenar un modelo",
         "mineria de datos", "analisis de datos"],
    ),
    "xai": (
        "Inteligencia Artificial Explicable (XAI) y árboles de decisión",
        ["xai", "inteligencia artificial explicable", "ia explicable", "arboles de decision",
         "modelos explicables", "interpretabilidad"],
    ),
    "ocr": (
        "Reconocimiento Óptico de Caracteres (OCR) y visión",
        ["ocr", "reconocimiento optico de caracteres", "extraccion de texto", "vision artificial"],
    ),
    "deep_learning": (
        "Deep learning y redes neuronales",
        ["deep learning", "aprendizaje profundo", "redes neuronales", "red neuronal",
         "tensorflow", "pytorch", "keras", "convolucional", "cnn", "transformers"],
    ),

    # -------------------------------------------------- Desarrollo Móvil y Web
    "movil": (
        "Desarrollo de aplicaciones móviles",
        ["android", "ios", "kotlin", "flutter", "swift", "app movil", "aplicacion movil",
         "aplicaciones moviles", "celular", "react native"],
    ),
    "web_backend": (
        "Desarrollo backend y APIs",
        ["backend", "back-end", "api", "apis", "api rest", "rest", "servidor web", "express", "jwt"],
    ),

    # -------------------------------------------------- Bases de Datos y Sistemas
    "bases_datos": (
        "Bases de datos y modelado relacional / SQL",
        ["base de datos", "bases de datos", "sql", "mysql", "postgresql", "postgres",
         "oracle", "consultas", "normalizacion", "entidad relacion", "entidad-relacion",
         "modelo relacional", "tablas", "joins"],
    ),
    "analisis_sistemas": (
        "Análisis, modelado y arquitectura de sistemas",
        ["analisis de sistemas", "diseno de sistemas", "modelado de sistemas", "uml",
         "casos de uso", "ingenieria de software", "arquitectura de software"],
    ),

    # -------------------------------------------------- Infraestructura y Redes
    "redes": (
        "Redes de computadoras y conectividad",
        ["redes de computadoras", "red de computadoras", "tcp/ip", "tcp", "subredes",
         "subnetting", "vlan", "vlans", "enrutamiento", "router", "routers", "switch",
         "cisco", "packet tracer", "ip"],
    ),
    "ciberseguridad": (
        "Ciberseguridad y protección de sistemas",
        ["ciberseguridad", "seguridad informatica", "hacking", "pentesting", "vulnerabilidades",
         "firewall", "firewalls", "cifrado", "criptografia"],
    ),

    # -------------------------------------------------- Metodología y Docencia
    "abp": (
        "Aprendizaje Basado en Problemas (ABP) e innovación docente",
        ["abp", "aprendizaje basado en problemas", "innovacion educativa", "metodologia docente",
         "pensamiento critico", "gestion innovadora"],
    ),
    "tutorias": (
        "Programa institucional de tutorías y seguimiento académico",
        ["tutoria", "tutorias", "programa institucional de tutorias", "pit", "seguimiento academico",
         "formacion integral"],
    ),
    "investigacion": (
        "Metodología de investigación y redacción técnica (APA / Tesis)",
        ["taller de investigacion", "protocolo", "tesis", "apa", "redaccion",
         "marco teorico", "residencia", "articulo", "investigacion", "publicacion cientifica"],
    ),

    # -------------------------------------------------- Tecnologías Emergentes (Brechas)
    "blockchain": (
        "Blockchain y contratos inteligentes",
        ["blockchain", "solidity", "contratos inteligentes", "ethereum", "web3", "criptomonedas"],
    ),
    "cuantica": (
        "Computación cuántica",
        ["computacion cuantica", "cuantico", "cuantica", "qiskit", "qubit", "qubits"],
    ),
}


# ==============================================================================
# UTILIDADES DE NORMALIZACIÓN Y BÚSQUEDA LÉXICA
# ==============================================================================
def normalizar(texto: str) -> str:
    """
    Convierte a minúsculas, elimina tildes y diacríticos, y colapsa espacios.
    Ejemplo: 'Programación en C++' -> 'programacion en c++'
    """
    t = unicodedata.normalize("NFKD", texto.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t)


def _contiene(texto_norm: str, termino: str) -> bool:
    """
    Verifica si un término está contenido en el texto respetando límites de palabra.
    Evita falsos positivos como detectar 'c' dentro de 'casa'.
    """
    termino = termino.strip()
    if not termino:
        return False
    patron = r"(?<![a-z0-9])" + re.escape(termino) + r"(?![a-z0-9])"
    return re.search(patron, texto_norm) is not None


def detectar_conceptos(texto: str) -> list[str]:
    """
    Retorna la lista de claves del catálogo que fueron mencionadas en el texto.
    """
    t = f" {normalizar(texto)} "
    return [k for k, (_, sins) in CONCEPTOS.items() if any(_contiene(t, s) for s in sins)]


def terminos_encontrados(texto: str, clave: str) -> list[str]:
    """
    Retorna las palabras específicas del texto que coincidieron con la clave.
    """
    t = f" {normalizar(texto)} "
    return [s.strip() for s in CONCEPTOS[clave][1] if _contiene(t, s)]


def etiqueta(clave: str) -> str:
    """
    Retorna la etiqueta legible en español para una clave de catálogo.
    """
    return CONCEPTOS[clave][0] if clave in CONCEPTOS else clave
