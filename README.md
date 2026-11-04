# Plataforma Web de Tutorías Institucionales · ITVER (TecNM)

Programa Institucional de Tutorías (PIT) — Ingeniería en Sistemas Computacionales.
Stack: **PostgreSQL 13+ · Node.js 18+ (Express 5 + pg) · HTML/Tailwind/JS (prototipos MIG TecNM)**.

```
pit-itver/
├── database/
│   ├── schema.sql        ← DDL: tablas, ENUMs, índices, triggers y vista
│   ├── actualizar_bd.sql ← actualiza una BD existente (aplica 001 → 008)
│   ├── seed.sql          ← datos de prueba ISC (8 alumnos, 3 tutores, 1 coordinación)
│   ├── migracion_001_evaluaciones.sql       ← tutor evalúa el programa (11 ítems)
│   ├── migracion_002_evaluacion_alumnos.sql ← tutorado evalúa a su tutor (34 ítems)
│   ├── migracion_003_avisos_asignaciones.sql ← avisos de coordinación + 3 alumnos sin tutor
│   ├── migracion_004_eleccion_tutor_perfiles.sql ← elección de tutor, horarios, perfil del tutorado
│   ├── migracion_005_perfil_tutor.sql ← perfil "persona" del tutor (foto, grado, frase, enfoque)
│   ├── migracion_007_ficha_identificacion.sql ← Anexo 6: ficha de identificación del tutorado
│   └── migracion_008_quitar_evaluacion_ux.sql ← retira la evaluación de satisfacción UX
├── server/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js     ← arranque Express, seguridad (helmet/CSP), estáticos
│       ├── routes.js     ← mapa de endpoints y permisos por rol
│       ├── config.js · db.js
│       ├── middleware/auth.js          ← JWT (verificar / firmar / roles)
│       ├── controllers/*.controller.js ← lógica de cada módulo
│       └── utils/ (errores, validaciones)
└── public/               ← frontend (lo sirve Express en http://localhost:3000)
    ├── index.html        ← Portal de acceso (login)
    ├── alumno.html       ← Tutorado: inicio, perfil, reservas, historial/riesgo, formatos
    ├── tutor.html        ← Maestro tutor: dashboard de grupo, agenda, canalizaciones
    ├── coordinacion.html ← Coordinación: KPIs globales, semáforo de riesgo, canalizaciones
    └── js/
        ├── app.js        ← integración fetch ⇄ API (las 3 funciones solicitadas + más)
        └── tailwind.config.js ← paleta institucional compartida
```

---

## 1. Requisitos

| Herramienta | Versión | Verificar |
|---|---|---|
| PostgreSQL | 13 o superior | `psql --version` |
| Node.js | 18 o superior (recomendado 20/22 LTS) | `node -v` |
| npm | incluido con Node | `npm -v` |

## 2. Crear la base de datos

Abre una terminal (en Windows: *SQL Shell (psql)* o PowerShell con `psql` en el PATH) y conéctate como superusuario:

```bash
psql -U postgres
```

```sql
CREATE ROLE pit_app WITH LOGIN PASSWORD 'pit_app_2026';
CREATE DATABASE pit_itver OWNER pit_app ENCODING 'UTF8' TEMPLATE template0;
\q
```

Carga el esquema y los datos de prueba (desde la carpeta `pit-itver/`):

```bash
psql -U pit_app -d pit_itver -h localhost -f database/schema.sql
psql -U pit_app -d pit_itver -h localhost -f database/seed.sql
```

Al final de `seed.sql` verás el resumen por nivel de riesgo:

```
 nivel_riesgo | tutorados
--------------+-----------
 BAJO         |         2
 MEDIO        |         1
 ALTO         |         3
 CRÍTICO      |         2
```

> **¿Ya tenías la base de datos creada?** Para actualizarla a la última versión sin borrar tus datos, ejecuta un solo archivo (aplica las migraciones 001 → 008 en orden y es seguro de repetir):
> ```
> $env:PGCLIENTENCODING="UTF8"
> psql -U pit_app -d pit_itver -h localhost -f database/actualizar_bd.sql
> ```
> Al final muestra las tablas con "ok"; si alguna dice "FALTA", revisa el mensaje de error que aparezca arriba.

> Ambos scripts son re-ejecutables: `schema.sql` elimina y recrea todo; `seed.sql` vacía las tablas antes de insertar.
> `pgcrypto` es una extensión "trusted" desde PostgreSQL 13, así que el dueño de la BD puede crearla.

## 3. Configurar y levantar la API

```bash
# (desde la raíz del proyecto)
cp .env.example .env          # Windows: copy .env.example .env
npm install
```

Edita `.env`:
- `DATABASE_URL` con tu usuario/contraseña.
- `JWT_SECRET` con una cadena aleatoria (el servidor **no arranca** si tiene menos de 32 caracteres):
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

```bash
npm start            # o npm run dev  (recarga automática)
```

Salida esperada:
```
PIT ITVER escuchando en http://localhost:3000
Periodo escolar vigente: 2026-2
```

Comprueba la conexión: <http://localhost:3000/api/health> → `{"ok":true,...,"bd":"conectada"}`

## 4. Abrir la plataforma

Entra a **<http://localhost:3000>** (Express sirve la carpeta `public/`).
Contraseña de todas las cuentas de prueba: **`Tutorias2026!`**

| Perfil en el portal | Correo | Qué verás |
|---|---|---|
| Coordinación | `coordinacion.tutorias@veracruz.tecnm.mx` | KPIs globales, semáforo de 8 alumnos, canalizaciones |
| Maestro Tutor | `noemi.tp@veracruz.tecnm.mx` | Grupo 4°B ISC (4 tutorados), agenda con pendientes |
| Maestro Tutor | `karla.pm@veracruz.tecnm.mx` | Grupos 6°A y 2°A ISC |
| Tutorado (CRÍTICO) | `l25020112@veracruz.tecnm.mx` | Carlos – 3 reprobadas, canalizado a PALPROG |
| Tutorado (CRÍTICO) | `l24020418@veracruz.tecnm.mx` | Luis Fernando – 4 reprobadas |
| Tutorado (ALTO) | `l25020204@veracruz.tecnm.mx` | Andrea – canalizada a CEPC |
| Tutorado (BAJO) | `l25020345@veracruz.tecnm.mx` | Juan – alumno regular |

> Si prefieres abrir el HTML con **Live Server** (puerto 5500), `app.js` detecta el puerto y llama a `http://localhost:3000/api`; deja `CORS_ORIGIN` en `.env` como viene.

---

## 5. Endpoints

Todas las rutas (excepto `login` y `health`) requieren `Authorization: Bearer <token>`.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | público | `{correo, password, rol?}` → `{token, usuario}`. Solo `@veracruz.tecnm.mx`; máx. 10 intentos/15 min |
| GET | `/api/auth/me` | todos | Perfil + datos académicos (alumno) o docentes (tutor) |
| GET | `/api/dashboard/stats` | coordinador, tutor | Total tutorados, % en riesgo, citas de la semana, canalizaciones activas (el tutor ve solo su grupo) |
| GET | `/api/tutorados/riesgo?nivel=ALTO,CRITICO&q=` | coordinador, tutor | Lista filtrada por nivel (acepta `CRITICO` sin acento) y búsqueda |
| POST | `/api/citas/reservar` | alumno, tutor, coordinador | Crea cita. Valida L–V, 07:00–20:00, 2 h de anticipación y traslapes |
| GET | `/api/citas/tutor/:tutorId?desde=&hasta=&estatus=` | tutor (propia), coordinador | Agenda del tutor |
| GET | `/api/citas/mias` | alumno | Citas del alumno *(extra, usado por el perfil)* |
| PATCH | `/api/citas/:id/estatus` | todos (con reglas) | Confirmar / completar / cancelar *(extra)* |
| POST | `/api/canalizaciones/crear` | tutor, coordinador | `{tutorado_id, area_destino, diagnostico_inicial}` |
| GET | `/api/canalizaciones` | todos (según alcance) | Listado *(extra, usado por las tablas)* |
| GET | `/api/evaluaciones/mia` | tutor | Las 11 preguntas del cuestionario y, si ya respondió, sus respuestas |
| POST | `/api/evaluaciones` | tutor | `{respuestas:{p1..p11: 1-5}, comentarios?}` → envía o actualiza la evaluación del periodo |
| GET | `/api/evaluaciones/resumen?periodo=` | coordinador | Promedio, distribución y % favorable por pregunta + estatus de cada tutor |
| GET | `/api/evaluaciones/tutor/:tutorId?periodo=` | coordinador | Respuestas individuales y comentarios de un tutor |
| GET | `/api/evaluaciones/alumno/mia` | alumno | Secciones 4 y 5 (34 ítems), tutor a evaluar y respuestas previas |
| POST | `/api/evaluaciones/alumno` | alumno | `{respuestas:{s4a..s4p, s5a..s5r: 1-5}, comentarios?}` → envía o actualiza |
| GET | `/api/evaluaciones/alumnos/resumen?periodo=&tutor_id=` | coordinador | Resultados por tutor, por ítem y lista de respuestas |
| GET | `/api/evaluaciones/alumnos/:id` | coordinador | Respuestas completas de un tutorado |

| GET | `/api/avisos?estado=` | tutor, coordinador | Tutor: avisos publicados. Coordinador: todos (borradores, publicados, archivados) |
| POST | `/api/avisos` | coordinador | `{titulo, contenido, categoria?, importante?, estado: 'Borrador'\|'Publicado'}` |
| PATCH | `/api/avisos/:id` | coordinador | Editar, publicar, archivar o regresar a borrador |
| DELETE | `/api/avisos/:id` | coordinador | Eliminar definitivamente |
| GET | `/api/tutores/disponibles` | alumno, coordinador | Directorio: presentación, áreas, horario, lugares libres |
| POST | `/api/tutores/elegir` | alumno | `{tutor_id}` → el tutorado elige (o cambia) a su tutor |
| GET | `/api/tutores/:id/disponibilidad?fecha=` | todos | Bloques de 60 min libres/ocupados dentro del horario del tutor |
| GET / PUT | `/api/tutores/mi-perfil` | tutor | Perfil "persona" (foto, grado, especialidad, experiencia, frase, enfoque), presentación, áreas y bloques de horario |
| PATCH | `/api/tutores/:id` | coordinador | `{max_tutorados?, acepta_tutorados?}` → cupo y disponibilidad |
| GET | `/api/asignaciones` | coordinador | Panorama: tutores con cupo y tutorados con el tutor que eligieron |
| PATCH | `/api/asignaciones/:id/finalizar` | coordinador | Retira a un tutorado de su tutor (caso excepcional) |
| GET / PUT | `/api/perfil-tutorado/mio` | alumno | Perfil "persona": foto, datos, frase, objetivos, frustraciones |
| GET | `/api/perfil-tutorado/:id` | tutor (solo sus tutorados), coordinador | Ver el perfil de un tutorado |

| GET / PUT | `/api/fichas/mia` | alumno | Ficha de Identificación (Anexo 6): consultar / llenar o actualizar |
| GET | `/api/fichas?q=&estado=` | coordinador | Lista de tutorados con el estado de su ficha (Pendiente, Enviada, Revisada, Requiere corrección) |
| GET / PUT / DELETE | `/api/fichas/tutorado/:id` | coordinador | Ver (con historial), corregir o capturar, eliminar la ficha de un tutorado |
| PATCH | `/api/fichas/tutorado/:id/estado` | coordinador | Marcar como revisada o solicitar corrección (con observaciones) |
| GET | `/api/fichas/exportar` | coordinador | Descarga CSV de todas las fichas (abre en Excel) |

**PDF del Anexo 6.** Se genera en el navegador sobre `public/formatos/anexo6_ficha_identificacion.pdf`, que es el documento oficial *Anexo 6 2026 Ficha de Identificación* convertido a PDF sin cambios (logos, encabezado, pie y tablas). Solo se escriben encima los datos y las “X” (librería `public/vendor/pdf-lib.min.js`, licencia MIT). Fecha de llenado, carrera, semestre y nombre del tutorado son fijos: el servidor los toma del registro escolar y la fecha es la del primer envío. Los teléfonos deben tener 10 dígitos válidos de México.


> La evaluación que hacen los tutorados es **confidencial**: ninguna ruta acepta el rol `tutor` (responde 403). Los avisos no son visibles para los alumnos.

### Ejemplos con curl

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"noemi.tp@veracruz.tecnm.mx","password":"Tutorias2026!"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

curl -s http://localhost:3000/api/dashboard/stats -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:3000/api/tutorados/riesgo?nivel=ALTO,CRITICO" -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/citas/tutor/1 -H "Authorization: Bearer $TOKEN"

# Canalizar a Juan (tutorado_id 3) a CIS
curl -s -X POST http://localhost:3000/api/canalizaciones/crear \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"tutorado_id":3,"area_destino":"CIS","diagnostico_inicial":"Interés en proyectos de la comunidad."}'
```

Reserva como alumno (hora local de Veracruz):

```json
POST /api/citas/reservar
{ "fecha": "2026-10-19", "hora": "11:00", "modalidad": "Línea", "motivo": "Revisión de avance reticular" }
```

Respuestas de error: `{"ok": false, "error": "mensaje legible"}` con 400 (validación), 401 (sin sesión), 403 (rol/alcance), 404, 409 (horario ocupado, canalización duplicada).

---

## 6. Reglas de negocio en la base de datos

- **Semáforo de riesgo automático** (`trg_tutorados_riesgo`): 0 reprobadas → BAJO, 1 → MEDIO, 2 → ALTO, 3+ → CRÍTICO. Si además el avance reticular es menor a la mitad de lo esperado para el semestre, sube un nivel (por eso Ximena, con 1 reprobada y 14 % en 4.°, aparece en ALTO). El `estatus_academico` (Regular/Irregular) también se calcula.
- **Dominio institucional** forzado con `CHECK` en `usuarios.correo_institucional`.
- **Una asignación activa por alumno y periodo**; el trigger `trg_asig_cupo` respeta `tutores.max_tutorados`.
- **Sin doble reserva**: índice único parcial por tutor/horario en citas vigentes + verificación de traslapes con `tstzrange` y bloqueo por tutor en la API.
- **Sin canalizaciones duplicadas abiertas** al mismo programa.
- `tutorados` / `tutores` solo aceptan usuarios con el rol correspondiente.
- `reportes_pit` guarda `archivo_url` **o** `contenido_json` (JSONB); al menos uno es obligatorio.

## 7. Qué está conectado y qué sigue siendo prototipo

**Conectado a PostgreSQL:** login y sesión por rol, KPIs (tutor y coordinación), distribución de canalizaciones, semáforo de riesgo con filtros y búsqueda, reserva de citas del alumno, agenda del tutor (confirmar / atender / cancelar), citas individuales y grupales del tutor, canalizaciones (alta y listados), perfil del alumno.

También el cuestionario **"Evaluación del Tutor hacia el Programa de Tutorías"** (11 preguntas Likert): el tutor lo responde en *Informes PIT & Evaluaciones* y la coordinación lo revisa en *Evaluaciones*. Y la **evaluación del acompañamiento tutorial** (secciones 4 y 5, 34 ítems): el tutorado la responde en *Formatos PIT* y solo la coordinación la consulta en *Evaluaciones → Tutorados evalúan a su Tutor*.

También: **el tutorado elige a su tutor** desde un directorio (presentación, áreas de apoyo, horario de atención y lugares libres) y solo puede reservar citas en los horarios libres de ese tutor; el tutor publica su horario y la coordinación supervisa cupos y disponibilidad. Cada tutorado tiene un **perfil tipo "persona"** (foto, edad, ciudad natal, familia, ocupación, frase, objetivos, frustraciones) que ven su tutor y la coordinación. Y **avisos** que la coordinación redacta, publica o archiva y que solo ven los tutores.

**Aún estático (no hay tabla/endpoint):** gráfica de reprobación por materia (requiere kárdex del SII), descarga de formatos PDF y minuta de acuerdos (se imprime con el navegador).

## 8. Notas para producción

- Servir detrás de HTTPS (Nginx/Apache) y poner `NODE_ENV=production`.
- Cambiar todas las contraseñas de prueba y el `JWT_SECRET`.
- El token se guarda en `localStorage`; para mayor seguridad puede migrarse a cookie `HttpOnly`.
- Sustituir el CDN de Tailwind por una compilación local (`npx tailwindcss`) para quitar `'unsafe-inline'` de la CSP.

---

## En línea (Vercel + Supabase)

La plataforma está publicada en **Vercel** y su base de datos vive en **Supabase** (PostgreSQL, esquema `pit`).

- Cada vez que se sube un cambio a la rama `main` de GitHub, Vercel vuelve a publicar la página sola.
- Durante cada publicación se ejecuta `scripts/migrar.js`, que aplica en la base de datos de la nube
  los archivos nuevos de `database/nube/` (en orden: `001_...`, `002_...`). Nunca edites uno ya aplicado:
  crea el siguiente número.
- Variables de entorno en Vercel: `DATABASE_URL` (pooler de Supabase, usuario `pit_app`), `DATABASE_SSL=true`,
  `JWT_SECRET`, `NODE_ENV=production`, `PERIODO_ACTUAL`, `DOMINIO_INSTITUCIONAL`, `TZ_INSTITUCIONAL`.
- `api/index.js` carga la misma app de Express que se usa en local; Vercel sirve `public/` como archivos estáticos.

### Trabajar en local (opcional)

```bash
cp .env.example .env     # ajusta DATABASE_URL y JWT_SECRET
npm install
npm start                # http://localhost:3000
```
