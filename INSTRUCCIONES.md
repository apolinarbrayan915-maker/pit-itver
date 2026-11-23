# Plataforma PIT ITVER · Instalación local

Plataforma Web del Programa Institucional de Tutorías (PIT) del Instituto Tecnológico de Veracruz (TecNM).
Esta carpeta contiene todo el código y la base de datos de demostración para ejecutarla en una computadora, sin internet.

Versión en línea (la misma plataforma): https://pit-itver.vercel.app

---

## 1. Requisitos (solo se instalan una vez)

| Programa | Versión | Descarga |
|---|---|---|
| **Node.js** | 18 o superior (recomendado 22 LTS) | https://nodejs.org |
| **PostgreSQL** | 13 o superior (recomendado 16 o 17) | https://www.postgresql.org/download/ |

Al instalar PostgreSQL, el asistente pide una **contraseña para el usuario `postgres`**. Anótala, porque se usa en el paso 2.
Deja el puerto por defecto, **5432**.

> Las librerías de Node ya vienen en la carpeta `node_modules`, así que no hace falta internet para instalar.

## 2. Instalar (crea la base de datos y carga los datos)

**Windows:** doble clic en **`INSTALAR.bat`**.

**macOS / Linux:** en una terminal dentro de esta carpeta ejecuta `./instalar.sh`.

**Cualquier sistema:** en una terminal dentro de esta carpeta ejecuta `npm run instalar`.

El instalador pregunta los datos de PostgreSQL. Presiona **Enter** para aceptar los valores entre corchetes y escribe la contraseña de `postgres`:

```
Servidor de PostgreSQL [localhost]:
Puerto [5432]:
Superusuario [postgres]:
Contraseña de "postgres": ********
```

Hace todo lo demás solo:

1. Crea el usuario `pit_app` y la base de datos `pit_itver`.
2. Crea el esquema `pit`.
3. Genera el archivo `.env` con la configuración y una clave de seguridad nueva.
4. Crea las tablas y carga los datos de demostración: 18 tutores, 80 tutorados, citas, canalizaciones y evaluaciones.

Termina con el mensaje **✔ Instalación terminada.**

> Para borrar todo y empezar de cero, usa `npm run instalar -- --reiniciar`. En Windows, abre una terminal en la carpeta y ejecuta `INSTALAR.bat --reiniciar`.

## 3. Iniciar la plataforma

**Windows:** doble clic en **`INICIAR.bat`**. El navegador se abre solo en http://localhost:3000.

**Cualquier sistema:** ejecuta `npm start` y abre http://localhost:3000.

Deja abierta la ventana negra mientras uses la plataforma. Para detenerla, ciérrala o presiona `Ctrl + C`.

## 4. Cuentas de prueba

La contraseña de **todas** las cuentas es **`Tutorias2026!`**. En el portal de acceso, primero elige el perfil (Tutorado, Tutor o Coordinación).

| Perfil | Nombre | Correo |
|---|---|---|
| Coordinación | Laura Elena Rivas Montiel | `coordinacion.tutorias@veracruz.tecnm.mx` |
| Tutor | Noemí del Carmen Tenorio Prieto | `noemi.tp@veracruz.tecnm.mx` |
| Tutor | Karla Gabriela Peralta Madrigal | `karla.pm@veracruz.tecnm.mx` |
| Tutorado | Carlos García Hernández | `l25020112@veracruz.tecnm.mx` |
| Tutorado | Andrea Martínez López | `l25020204@veracruz.tecnm.mx` |

Los 18 tutores y 80 tutorados son **datos ficticios** de demostración.

Seguridad de las cuentas:
- Tras 5 contraseñas incorrectas seguidas, la cuenta se bloquea 15 minutos.
- La sesión se cierra al pulsar "Cerrar sesión", al cerrar la pestaña o tras 30 minutos sin uso.

## 5. Problemas comunes

| Mensaje | Solución |
|---|---|
| `No se encontró Node.js` | Instala Node.js (paso 1) y vuelve a abrir `INSTALAR.bat`. |
| `No se pudo conectar a PostgreSQL` | Revisa que el servicio de PostgreSQL esté iniciado: en Windows, en *Servicios*, busca "postgresql" y elige "Iniciar". Revisa también la contraseña de `postgres`. |
| `type "..." already exists` o `Falló la carga de las tablas` | Ya había una base de datos de una versión anterior. Ejecuta el instalador con `--reiniciar`. |
| `EADDRINUSE :3000` | Ya hay otra copia abierta. Ciérrala, o cambia `PORT=3000` por `PORT=3001` en `.env`. |
| Los estilos se ven sin formato | La página carga Tailwind y los íconos desde internet. Sin conexión funciona, pero sin estilos. |

Notas:
- Los avisos por correo electrónico están **desactivados** en la copia local. Para activarlos hay que configurar `SMTP_USER` y `SMTP_PASS` en `.env`.
- El modo demostración (`CAMBIO_TUTOR_ABIERTO=1` y `EVALUACION_ABIERTA=1` en `.env`) mantiene abiertas las ventanas de cambio de tutor y de evaluación tutoral, aunque la fecha no corresponda.

## 6. Estructura del proyecto

```
pit-itver/
├── INSTALAR.bat / instalar.sh   ← instalación en un paso
├── INICIAR.bat                  ← inicia la plataforma (Windows)
├── package.json                 ← dependencias y comandos (npm start, npm run instalar)
├── server/src/                  ← API REST (Node.js + Express 5)
│   ├── server.js, app.js        ← arranque y seguridad (helmet, CSP)
│   ├── routes.js                ← endpoints y permisos por rol
│   ├── middleware/auth.js       ← sesiones (JWT + tabla sesiones)
│   ├── controllers/             ← lógica de cada módulo
│   └── utils/                   ← validaciones, calendario escolar, correo
├── public/                      ← interfaz web (HTML + Tailwind + JavaScript)
│   ├── index.html               ← portal de acceso
│   ├── alumno.html, tutor.html, coordinacion.html
│   └── js/app.js, js/coordinacion.js
├── database/nube/               ← migraciones SQL (001 → 013) con esquema y datos
├── scripts/                     ← instalador y aplicador de migraciones
└── recomendador/                ← (opcional) servicio Python de búsqueda semántica de tutores
```

**Tecnologías:** PostgreSQL · Node.js · Express 5 · JWT · bcrypt · HTML5 · Tailwind CSS · JavaScript.
