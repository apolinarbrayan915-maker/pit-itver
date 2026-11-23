"""Servicio privado de inferencia para PIT. El catálogo se monta fuera de Git."""
import json
import os
import re
import unicodedata
from contextlib import asynccontextmanager
from pathlib import Path
from secrets import compare_digest
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field, StringConstraints

from modulo_tutorias import config
from modulo_tutorias.paso1_parser import procesar_cv
from modulo_tutorias.paso2_matcher import MotorSemantico
from modulo_tutorias.paso3_classifier import Clasificador


def identidad(nombre: str) -> str:
    nombre = ''.join(c for c in unicodedata.normalize("NFD", nombre.casefold())
                     if not unicodedata.combining(c))
    palabras = re.findall(r"[a-z]+", nombre)
    return " ".join(sorted(p for p in palabras if p not in {"dra", "dr", "mtra", "mtro", "ing"}))


@asynccontextmanager
async def lifespan(app: FastAPI):
    token = os.environ["RECOMENDADOR_TOKEN"].encode()
    if len(token) < 32:
        raise ValueError("RECOMENDADOR_TOKEN debe tener al menos 32 caracteres")
    data = Path(os.environ["RECOMENDADOR_DATOS"]).resolve(strict=True)
    config.DIR_CACHE = data / "cache"
    catalogo = json.loads((data / "tutores.json").read_text(encoding="utf-8"))
    fuente = Path(__file__).with_name("catalogo_materias.json")
    perfiles = json.loads(fuente.read_text(encoding="utf-8"))["perfiles"]
    materias = {p["correo_pit"]: p["materias"] for p in perfiles if p["correo_pit"]}
    por_nombre = {}
    for perfil in perfiles:
        por_nombre.setdefault(identidad(perfil["nombre"]), []).append(perfil["materias"])
    cvs, tutores = {}, {}
    for tutor in catalogo:
        tid = tutor["id"].strip().lower()
        ruta = (data / "cvs" / tutor["archivo"]).resolve(strict=True)
        if not ruta.is_relative_to(data / "cvs") or tid in tutores:
            raise ValueError("Ruta fuera de cvs o identificador repetido en tutores.json")
        cv = procesar_cv(ruta, tid, tutor["nombre"])
        if cv.fragmentos():
            coincidencias = por_nombre.get(identidad(tutor["nombre"]), [])
            cv.materias_reportadas = materias.get(tid, coincidencias[0] if len(coincidencias) == 1 else [])
            cvs[tid] = cv
            tutores[tid] = dict(tutor, id=tid, capacidad=1, tutorados_actuales=0,
                               correo="", horario=[], cubiculo="")
    if not cvs:
        raise ValueError("El catálogo debe contener al menos un CV con texto")
    motor = MotorSemantico()
    motor.indexar(list(cvs.values()))
    app.state.token, app.state.motor = token, motor
    app.state.cvs, app.state.tutores = cvs, tutores
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class Consulta(BaseModel):
    duda: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=500)]
    tutores: list[str] = Field(max_length=1000)


@app.post("/recomendar")
def recomendar(consulta: Consulta, request: Request, authorization: Annotated[str, Header()] = ""):
    state = request.app.state
    if not compare_digest(authorization.encode(), b"Bearer " + state.token):
        raise HTTPException(401, "Acceso restringido")
    ids = set(consulta.tutores) & state.tutores.keys()
    if not ids:
        return {"modo": "sin_catalogo", "candidatos": []}

    clasificador = Clasificador(state.motor, [state.cvs[i] for i in ids],
                                [state.tutores[i] for i in ids])
    result = clasificador.emparejar(consulta.duda)
    return {"modo": result.modo, "candidatos": [
        {"id": c.tutor_id, "score": c.score, "sem": c.s_sem, "proj": c.s_proj, "cert": c.s_cert}
        for c in result.candidatos
    ] if result.modo == "ranking" else []}
