-- =============================================================================
--  PLATAFORMA WEB DE TUTORÍAS INSTITUCIONALES – ITVER (TecNM)
--  Programa Institucional de Tutorías (PIT) · Ingeniería en Sistemas Computacionales
--  Esquema relacional PostgreSQL 13+
--
--  Ejecutar:  psql -U postgres -d pit_itver -f database/schema.sql
--  El script es re-ejecutable: elimina y recrea todos los objetos del esquema.
-- =============================================================================

SET client_min_messages = warning;

BEGIN;

-- pgcrypto: gen_salt()/crypt() para generar hashes bcrypt desde seed.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Limpieza (orden inverso de dependencias)
-- -----------------------------------------------------------------------------
DROP VIEW  IF EXISTS v_tutorados_detalle CASCADE;
DROP TABLE IF EXISTS fichas_identificacion_historial CASCADE;
DROP TABLE IF EXISTS fichas_identificacion  CASCADE;
DROP TABLE IF EXISTS evaluaciones_ux        CASCADE;  -- tabla retirada (migración 008)
DROP TABLE IF EXISTS perfiles_tutorado      CASCADE;
DROP TABLE IF EXISTS tutor_horarios         CASCADE;
DROP TABLE IF EXISTS avisos                 CASCADE;
DROP TABLE IF EXISTS evaluaciones_alumno    CASCADE;
DROP TABLE IF EXISTS evaluaciones_tutor     CASCADE;
DROP TABLE IF EXISTS reportes_pit           CASCADE;
DROP TABLE IF EXISTS canalizaciones         CASCADE;
DROP TABLE IF EXISTS citas_tutorias         CASCADE;
DROP TABLE IF EXISTS asignaciones_tutoria   CASCADE;
DROP TABLE IF EXISTS tutores                CASCADE;
DROP TABLE IF EXISTS tutorados              CASCADE;
DROP TABLE IF EXISTS usuarios               CASCADE;

DROP TYPE IF EXISTS rol_usuario            CASCADE;
DROP TYPE IF EXISTS estado_usuario         CASCADE;
DROP TYPE IF EXISTS nivel_riesgo           CASCADE;
DROP TYPE IF EXISTS estatus_academico      CASCADE;
DROP TYPE IF EXISTS estatus_asignacion     CASCADE;
DROP TYPE IF EXISTS tipo_cita              CASCADE;
DROP TYPE IF EXISTS modalidad_cita         CASCADE;
DROP TYPE IF EXISTS estatus_cita           CASCADE;
DROP TYPE IF EXISTS area_canalizacion      CASCADE;
DROP TYPE IF EXISTS estatus_canalizacion   CASCADE;
DROP TYPE IF EXISTS tipo_formato_pit       CASCADE;

DROP FUNCTION IF EXISTS fn_set_updated_at()          CASCADE;
DROP FUNCTION IF EXISTS fn_calcular_nivel_riesgo()   CASCADE;
DROP FUNCTION IF EXISTS fn_validar_cupo_tutor()      CASCADE;
DROP FUNCTION IF EXISTS fn_validar_roles()           CASCADE;

-- -----------------------------------------------------------------------------
-- Tipos enumerados (catálogos cerrados del PIT)
-- -----------------------------------------------------------------------------
CREATE TYPE rol_usuario          AS ENUM ('alumno', 'tutor', 'coordinador');
CREATE TYPE estado_usuario       AS ENUM ('activo', 'inactivo', 'bloqueado');
CREATE TYPE nivel_riesgo         AS ENUM ('BAJO', 'MEDIO', 'ALTO', 'CRÍTICO');
CREATE TYPE estatus_academico    AS ENUM ('Regular', 'Irregular', 'Baja Temporal', 'Baja Definitiva', 'Egresado');
CREATE TYPE estatus_asignacion   AS ENUM ('Activa', 'Finalizada', 'Reasignada');
CREATE TYPE tipo_cita            AS ENUM ('Individual', 'Grupal');
CREATE TYPE modalidad_cita       AS ENUM ('Presencial', 'Línea');
CREATE TYPE estatus_cita         AS ENUM ('Pendiente', 'Confirmada', 'Completada', 'Cancelada');
CREATE TYPE area_canalizacion    AS ENUM ('PALPROG', 'CIS', 'CEPC', 'PAPAs', 'Psicología/Salud');
CREATE TYPE estatus_canalizacion AS ENUM ('Pendiente', 'En Proceso', 'Aceptado', 'Atendido', 'Cerrado');
CREATE TYPE tipo_formato_pit     AS ENUM ('FichaIdentificacion', 'ReporteSemestral', 'PlanTrabajo');

-- -----------------------------------------------------------------------------
-- Función genérica: mantener updated_at
-- -----------------------------------------------------------------------------
CREATE FUNCTION fn_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. USUARIOS
-- =============================================================================
CREATE TABLE usuarios (
    id                    SERIAL PRIMARY KEY,
    no_control_o_rfc      VARCHAR(13)  NOT NULL,
    nombre                VARCHAR(80)  NOT NULL,
    apellidos             VARCHAR(120) NOT NULL,
    correo_institucional  VARCHAR(120) NOT NULL,
    password_hash         VARCHAR(255) NOT NULL,
    rol                   rol_usuario    NOT NULL,
    estado                estado_usuario NOT NULL DEFAULT 'activo',
    ultimo_acceso         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- Solo correos del dominio institucional ITVER
    CONSTRAINT chk_usuarios_correo_dominio
        CHECK (correo_institucional ~* '^[a-z0-9._%+-]+@veracruz\.tecnm\.mx$'),
    -- No. de control (8-9 dígitos, puede iniciar con C/B/D/M) o RFC docente (12-13)
    CONSTRAINT chk_usuarios_control_rfc
        CHECK (no_control_o_rfc ~ '^([A-Z]?[0-9]{8,9}|[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2,3})$')
);

CREATE UNIQUE INDEX ux_usuarios_correo     ON usuarios (lower(correo_institucional));
CREATE UNIQUE INDEX ux_usuarios_control    ON usuarios (no_control_o_rfc);
CREATE INDEX        ix_usuarios_rol_estado ON usuarios (rol, estado);

CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE usuarios IS 'Cuentas de acceso: alumnos (tutorados), docentes tutores y coordinación PIT.';

-- =============================================================================
-- 2. TUTORADOS (perfil académico del alumno)
-- =============================================================================
CREATE TABLE tutorados (
    id                    SERIAL PRIMARY KEY,
    usuario_id            INTEGER NOT NULL UNIQUE
                              REFERENCES usuarios (id) ON DELETE CASCADE,
    carrera               VARCHAR(80) NOT NULL DEFAULT 'Ingeniería en Sistemas Computacionales',
    semestre              SMALLINT    NOT NULL,
    periodo_ingreso       VARCHAR(6)  NOT NULL,           -- p.ej. '2024-2'
    estatus_academico     estatus_academico NOT NULL DEFAULT 'Regular',
    nivel_riesgo          nivel_riesgo      NOT NULL DEFAULT 'BAJO',
    materias_reprobadas   SMALLINT    NOT NULL DEFAULT 0,
    avance_reticular_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
    promedio              NUMERIC(5,2),
    telefono              VARCHAR(15),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tutorados_semestre    CHECK (semestre BETWEEN 1 AND 12),
    CONSTRAINT chk_tutorados_periodo     CHECK (periodo_ingreso ~ '^[0-9]{4}-[12]$'),
    CONSTRAINT chk_tutorados_reprobadas  CHECK (materias_reprobadas >= 0),
    CONSTRAINT chk_tutorados_avance      CHECK (avance_reticular_pct BETWEEN 0 AND 100),
    CONSTRAINT chk_tutorados_promedio    CHECK (promedio IS NULL OR promedio BETWEEN 0 AND 100)
);

CREATE INDEX ix_tutorados_riesgo ON tutorados (nivel_riesgo);

/*
 * Semáforo de riesgo académico (alineado al prototipo de coordinación):
 *   0 reprobadas            -> BAJO
 *   1 reprobada             -> MEDIO
 *   2 reprobadas            -> ALTO
 *   3 o más reprobadas      -> CRÍTICO
 * Además, un rezago reticular severo (avance < 50 % de lo esperado para el
 * semestre, con al menos una reprobada) eleva el nivel un escalón.
 * Se recalcula automáticamente en INSERT/UPDATE.
 */
CREATE FUNCTION fn_calcular_nivel_riesgo() RETURNS trigger AS $$
DECLARE
    esperado NUMERIC;
    nivel    nivel_riesgo;
BEGIN
    nivel := CASE
                WHEN NEW.materias_reprobadas >= 3 THEN 'CRÍTICO'
                WHEN NEW.materias_reprobadas  = 2 THEN 'ALTO'
                WHEN NEW.materias_reprobadas  = 1 THEN 'MEDIO'
                ELSE 'BAJO'
             END;

    -- Avance esperado aproximado: plan de 9 semestres
    esperado := LEAST(100, ((NEW.semestre - 1) / 9.0) * 100);
    IF NEW.materias_reprobadas >= 1
       AND esperado > 0
       AND NEW.avance_reticular_pct < esperado * 0.5 THEN
        nivel := CASE nivel
                    WHEN 'MEDIO' THEN 'ALTO'
                    WHEN 'ALTO'  THEN 'CRÍTICO'
                    ELSE nivel
                 END;
    END IF;

    NEW.nivel_riesgo := nivel;
    NEW.estatus_academico := CASE
        WHEN NEW.estatus_academico IN ('Baja Temporal', 'Baja Definitiva', 'Egresado')
            THEN NEW.estatus_academico
        WHEN NEW.materias_reprobadas > 0 THEN 'Irregular'
        ELSE 'Regular'
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tutorados_riesgo
    BEFORE INSERT OR UPDATE OF materias_reprobadas, avance_reticular_pct, semestre, estatus_academico
    ON tutorados
    FOR EACH ROW EXECUTE FUNCTION fn_calcular_nivel_riesgo();

CREATE TRIGGER trg_tutorados_updated BEFORE UPDATE ON tutorados
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =============================================================================
-- 3. TUTORES (docentes)
-- =============================================================================
CREATE TABLE tutores (
    id                  SERIAL PRIMARY KEY,
    usuario_id          INTEGER NOT NULL UNIQUE
                            REFERENCES usuarios (id) ON DELETE CASCADE,
    departamento        VARCHAR(80) NOT NULL DEFAULT 'Sistemas y Computación',
    cubiculo            VARCHAR(40),
    max_tutorados       SMALLINT    NOT NULL DEFAULT 40,
    formacion_tutorial  VARCHAR(60),                       -- 'Diplomado Cumplido', 'Cursos Básicos'…
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tutores_max CHECK (max_tutorados BETWEEN 1 AND 60)
);

CREATE TRIGGER trg_tutores_updated BEFORE UPDATE ON tutores
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Garantiza que tutorados/tutores solo apunten a usuarios con el rol correcto
CREATE FUNCTION fn_validar_roles() RETURNS trigger AS $$
DECLARE
    r rol_usuario;
    esperado rol_usuario;
BEGIN
    esperado := CASE TG_TABLE_NAME WHEN 'tutorados' THEN 'alumno' ELSE 'tutor' END;
    SELECT rol INTO r FROM usuarios WHERE id = NEW.usuario_id;
    IF r IS DISTINCT FROM esperado THEN
        RAISE EXCEPTION 'El usuario % debe tener rol "%" para registrarse en %',
              NEW.usuario_id, esperado, TG_TABLE_NAME
              USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tutorados_rol BEFORE INSERT OR UPDATE OF usuario_id ON tutorados
    FOR EACH ROW EXECUTE FUNCTION fn_validar_roles();
CREATE TRIGGER trg_tutores_rol   BEFORE INSERT OR UPDATE OF usuario_id ON tutores
    FOR EACH ROW EXECUTE FUNCTION fn_validar_roles();

-- =============================================================================
-- 4. ASIGNACIONES TUTOR–TUTORADO (por periodo escolar)
-- =============================================================================
CREATE TABLE asignaciones_tutoria (
    id                  SERIAL PRIMARY KEY,
    tutor_id            INTEGER NOT NULL REFERENCES tutores   (id) ON DELETE RESTRICT,
    tutorado_id         INTEGER NOT NULL REFERENCES tutorados (id) ON DELETE CASCADE,
    periodo_escolar     VARCHAR(6)  NOT NULL,              -- '2026-2' (Ago–Dic 2026)
    grupo               VARCHAR(20),                       -- '4°B ISC'
    estatus_asignacion  estatus_asignacion NOT NULL DEFAULT 'Activa',
    fecha_asignacion    DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_asig_periodo CHECK (periodo_escolar ~ '^[0-9]{4}-[12]$')
);

-- Un tutorado solo puede tener UNA asignación activa por periodo
CREATE UNIQUE INDEX ux_asig_tutorado_periodo_activa
    ON asignaciones_tutoria (tutorado_id, periodo_escolar)
    WHERE estatus_asignacion = 'Activa';
CREATE INDEX ix_asig_tutor_periodo ON asignaciones_tutoria (tutor_id, periodo_escolar);

-- Respeta tutores.max_tutorados
CREATE FUNCTION fn_validar_cupo_tutor() RETURNS trigger AS $$
DECLARE
    cupo   SMALLINT;
    actual INTEGER;
BEGIN
    IF NEW.estatus_asignacion <> 'Activa' THEN
        RETURN NEW;
    END IF;
    SELECT max_tutorados INTO cupo FROM tutores WHERE id = NEW.tutor_id FOR UPDATE;
    SELECT count(*) INTO actual
      FROM asignaciones_tutoria
     WHERE tutor_id = NEW.tutor_id
       AND periodo_escolar = NEW.periodo_escolar
       AND estatus_asignacion = 'Activa'
       AND id IS DISTINCT FROM NEW.id;
    IF actual >= cupo THEN
        RAISE EXCEPTION 'El tutor % alcanzó su cupo máximo de % tutorados en %',
              NEW.tutor_id, cupo, NEW.periodo_escolar
              USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asig_cupo BEFORE INSERT OR UPDATE OF tutor_id, estatus_asignacion ON asignaciones_tutoria
    FOR EACH ROW EXECUTE FUNCTION fn_validar_cupo_tutor();

-- =============================================================================
-- 5. CITAS DE TUTORÍA
-- =============================================================================
CREATE TABLE citas_tutorias (
    id             SERIAL PRIMARY KEY,
    tutor_id       INTEGER NOT NULL REFERENCES tutores   (id) ON DELETE CASCADE,
    tutorado_id    INTEGER          REFERENCES tutorados (id) ON DELETE CASCADE, -- NULL en sesiones grupales
    fecha_hora     TIMESTAMPTZ NOT NULL,
    duracion_min   SMALLINT    NOT NULL DEFAULT 60,
    tipo           tipo_cita       NOT NULL DEFAULT 'Individual',
    modalidad      modalidad_cita  NOT NULL DEFAULT 'Presencial',
    grupo          VARCHAR(20),                             -- para sesiones grupales
    motivo         TEXT        NOT NULL,
    estatus        estatus_cita    NOT NULL DEFAULT 'Pendiente',
    notas_tutor    TEXT,
    minuta         JSONB,                                   -- {asuntos, acuerdos, seguimiento, actualizada}
    creado_por     INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_citas_individual_tutorado
        CHECK (tipo = 'Grupal' OR tutorado_id IS NOT NULL),
    CONSTRAINT chk_citas_duracion CHECK (duracion_min BETWEEN 15 AND 240),
    CONSTRAINT chk_citas_motivo   CHECK (length(trim(motivo)) >= 5)
);

-- Evita doble reserva del mismo horario para un tutor (citas vigentes)
CREATE UNIQUE INDEX ux_citas_tutor_horario_vigente
    ON citas_tutorias (tutor_id, fecha_hora)
    WHERE estatus IN ('Pendiente', 'Confirmada');
CREATE INDEX ix_citas_tutor_fecha    ON citas_tutorias (tutor_id, fecha_hora);
CREATE INDEX ix_citas_tutorado_fecha ON citas_tutorias (tutorado_id, fecha_hora);

CREATE TRIGGER trg_citas_updated BEFORE UPDATE ON citas_tutorias
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =============================================================================
-- 6. CANALIZACIONES A PROGRAMAS / COMUNIDADES DE APOYO
-- =============================================================================
CREATE TABLE canalizaciones (
    id                    SERIAL PRIMARY KEY,
    tutorado_id           INTEGER NOT NULL REFERENCES tutorados (id) ON DELETE CASCADE,
    tutor_id              INTEGER NOT NULL REFERENCES tutores   (id) ON DELETE RESTRICT,
    area_destino          area_canalizacion    NOT NULL,
    diagnostico_inicial   TEXT                 NOT NULL,
    estatus_canalizacion  estatus_canalizacion NOT NULL DEFAULT 'Pendiente',
    seguimiento           TEXT,
    fecha_registro        TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_cierre          TIMESTAMPTZ,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_canal_diagnostico CHECK (length(trim(diagnostico_inicial)) >= 10),
    CONSTRAINT chk_canal_cierre CHECK (
        fecha_cierre IS NULL OR estatus_canalizacion IN ('Atendido', 'Cerrado')
    )
);

-- No duplicar una canalización abierta al mismo programa
CREATE UNIQUE INDEX ux_canal_abierta_por_area
    ON canalizaciones (tutorado_id, area_destino)
    WHERE estatus_canalizacion IN ('Pendiente', 'En Proceso', 'Aceptado');
CREATE INDEX ix_canal_estatus ON canalizaciones (estatus_canalizacion, area_destino);

CREATE TRIGGER trg_canal_updated BEFORE UPDATE ON canalizaciones
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =============================================================================
-- 7. REPORTES / FORMATOS PIT
-- =============================================================================
CREATE TABLE reportes_pit (
    id             SERIAL PRIMARY KEY,
    tutorado_id    INTEGER NOT NULL REFERENCES tutorados (id) ON DELETE CASCADE,
    periodo        VARCHAR(6) NOT NULL,
    tipo_formato   tipo_formato_pit NOT NULL,
    archivo_url    TEXT,      -- ruta/URL del PDF firmado
    contenido_json JSONB,     -- o captura estructurada del formato
    fecha_subida   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_reportes_periodo CHECK (periodo ~ '^[0-9]{4}-[12]$'),
    CONSTRAINT chk_reportes_contenido CHECK (archivo_url IS NOT NULL OR contenido_json IS NOT NULL),
    CONSTRAINT ux_reportes_unico UNIQUE (tutorado_id, periodo, tipo_formato)
);

-- =============================================================================
-- VISTA de apoyo: tutorado + usuario + tutor del periodo vigente
-- =============================================================================
CREATE VIEW v_tutorados_detalle AS
SELECT
    t.id                         AS tutorado_id,
    u.id                         AS usuario_id,
    u.no_control_o_rfc           AS no_control,
    u.nombre,
    u.apellidos,
    u.apellidos || ' ' || u.nombre AS nombre_completo,
    u.correo_institucional,
    u.estado,
    t.carrera,
    t.semestre,
    t.periodo_ingreso,
    t.estatus_academico,
    t.nivel_riesgo,
    t.materias_reprobadas,
    t.avance_reticular_pct,
    t.promedio,
    a.periodo_escolar,
    a.grupo,
    a.tutor_id,
    ut.nombre || ' ' || ut.apellidos AS tutor_nombre
FROM tutorados t
JOIN usuarios u                    ON u.id = t.usuario_id
LEFT JOIN asignaciones_tutoria a   ON a.tutorado_id = t.id AND a.estatus_asignacion = 'Activa'
LEFT JOIN tutores tu               ON tu.id = a.tutor_id
LEFT JOIN usuarios ut              ON ut.id = tu.usuario_id;

COMMIT;

-- =============================================================================
-- 8. EVALUACIÓN DEL TUTOR HACIA EL PIT (11 reactivos Likert)
--    Definida en su propio archivo para poder aplicarla también como migración
--    sobre una base de datos que ya tiene información.
-- =============================================================================
\ir migracion_001_evaluaciones.sql

-- =============================================================================
-- 9. EVALUACIÓN DEL ACOMPAÑAMIENTO TUTORIAL POR EL TUTORADO (34 ítems)
-- =============================================================================
\ir migracion_002_evaluacion_alumnos.sql

-- =============================================================================
-- 10. AVISOS DE LA COORDINACIÓN (dirigidos a tutores)
-- =============================================================================
\ir migracion_003_avisos_asignaciones.sql

-- =============================================================================
-- 11. ELECCIÓN DE TUTOR, HORARIOS DE ATENCIÓN Y PERFIL DEL TUTORADO
-- =============================================================================
\ir migracion_004_eleccion_tutor_perfiles.sql

-- =============================================================================
-- 12. PERFIL "PERSONA" DEL TUTOR
-- =============================================================================
\ir migracion_005_perfil_tutor.sql

-- =============================================================================
-- 13. FICHA DE IDENTIFICACIÓN DEL TUTORADO (ANEXO 6)
-- =============================================================================
\ir migracion_007_ficha_identificacion.sql
