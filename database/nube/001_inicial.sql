SET search_path = pit;
SET check_function_bodies = false;
CREATE TYPE pit.area_canalizacion AS ENUM (
    'PALPROG',
    'CIS',
    'CEPC',
    'PAPAs',
    'Psicología/Salud'
);
CREATE TYPE pit.estado_usuario AS ENUM (
    'activo',
    'inactivo',
    'bloqueado'
);
CREATE TYPE pit.estatus_academico AS ENUM (
    'Regular',
    'Irregular',
    'Baja Temporal',
    'Baja Definitiva',
    'Egresado'
);
CREATE TYPE pit.estatus_asignacion AS ENUM (
    'Activa',
    'Finalizada',
    'Reasignada'
);
CREATE TYPE pit.estatus_canalizacion AS ENUM (
    'Pendiente',
    'En Proceso',
    'Aceptado',
    'Atendido',
    'Cerrado'
);
CREATE TYPE pit.estatus_cita AS ENUM (
    'Pendiente',
    'Confirmada',
    'Completada',
    'Cancelada'
);
CREATE TYPE pit.modalidad_cita AS ENUM (
    'Presencial',
    'Línea'
);
CREATE TYPE pit.nivel_riesgo AS ENUM (
    'BAJO',
    'MEDIO',
    'ALTO',
    'CRÍTICO'
);
CREATE TYPE pit.rol_usuario AS ENUM (
    'alumno',
    'tutor',
    'coordinador'
);
CREATE TYPE pit.tipo_cita AS ENUM (
    'Individual',
    'Grupal'
);
CREATE TYPE pit.tipo_formato_pit AS ENUM (
    'FichaIdentificacion',
    'ReporteSemestral',
    'PlanTrabajo'
);
CREATE FUNCTION pit.fn_calcular_nivel_riesgo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;
CREATE FUNCTION pit.fn_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
CREATE FUNCTION pit.fn_validar_cupo_tutor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;
CREATE FUNCTION pit.fn_validar_roles() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;
CREATE TABLE pit.asignaciones_tutoria (
    id integer NOT NULL,
    tutor_id integer NOT NULL,
    tutorado_id integer NOT NULL,
    periodo_escolar character varying(6) NOT NULL,
    grupo character varying(20),
    estatus_asignacion pit.estatus_asignacion DEFAULT 'Activa'::pit.estatus_asignacion NOT NULL,
    fecha_asignacion date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    origen character varying(25) DEFAULT 'Coordinación'::character varying NOT NULL,
    CONSTRAINT chk_asig_origen CHECK (((origen)::text = ANY ((ARRAY['Coordinación'::character varying, 'Elección del tutorado'::character varying])::text[]))),
    CONSTRAINT chk_asig_periodo CHECK (((periodo_escolar)::text ~ '^[0-9]{4}-[12]$'::text))
);
CREATE SEQUENCE pit.asignaciones_tutoria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.asignaciones_tutoria_id_seq OWNED BY pit.asignaciones_tutoria.id;
CREATE TABLE pit.avisos (
    id integer NOT NULL,
    titulo character varying(150) NOT NULL,
    categoria character varying(40) DEFAULT 'Coordinación de Tutorías'::character varying NOT NULL,
    contenido text NOT NULL,
    importante boolean DEFAULT false NOT NULL,
    estado character varying(10) DEFAULT 'Borrador'::character varying NOT NULL,
    autor_id integer,
    fecha_publicacion timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT avisos_contenido_check CHECK (((length(TRIM(BOTH FROM contenido)) >= 10) AND (length(contenido) <= 4000))),
    CONSTRAINT avisos_estado_check CHECK (((estado)::text = ANY ((ARRAY['Borrador'::character varying, 'Publicado'::character varying, 'Archivado'::character varying])::text[]))),
    CONSTRAINT avisos_titulo_check CHECK ((length(TRIM(BOTH FROM titulo)) >= 5)),
    CONSTRAINT chk_avisos_publicacion CHECK ((((estado)::text = 'Borrador'::text) OR (fecha_publicacion IS NOT NULL)))
);
COMMENT ON TABLE pit.avisos IS 'Avisos de la Coordinación de Tutorías dirigidos a los tutores.';
CREATE SEQUENCE pit.avisos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.avisos_id_seq OWNED BY pit.avisos.id;
CREATE TABLE pit.canalizaciones (
    id integer NOT NULL,
    tutorado_id integer NOT NULL,
    tutor_id integer NOT NULL,
    area_destino pit.area_canalizacion NOT NULL,
    diagnostico_inicial text NOT NULL,
    estatus_canalizacion pit.estatus_canalizacion DEFAULT 'Pendiente'::pit.estatus_canalizacion NOT NULL,
    seguimiento text,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_cierre timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_canal_cierre CHECK (((fecha_cierre IS NULL) OR (estatus_canalizacion = ANY (ARRAY['Atendido'::pit.estatus_canalizacion, 'Cerrado'::pit.estatus_canalizacion])))),
    CONSTRAINT chk_canal_diagnostico CHECK ((length(TRIM(BOTH FROM diagnostico_inicial)) >= 10))
);
CREATE SEQUENCE pit.canalizaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.canalizaciones_id_seq OWNED BY pit.canalizaciones.id;
CREATE TABLE pit.citas_tutorias (
    id integer NOT NULL,
    tutor_id integer NOT NULL,
    tutorado_id integer,
    fecha_hora timestamp with time zone NOT NULL,
    duracion_min smallint DEFAULT 60 NOT NULL,
    tipo pit.tipo_cita DEFAULT 'Individual'::pit.tipo_cita NOT NULL,
    modalidad pit.modalidad_cita DEFAULT 'Presencial'::pit.modalidad_cita NOT NULL,
    grupo character varying(20),
    motivo text NOT NULL,
    estatus pit.estatus_cita DEFAULT 'Pendiente'::pit.estatus_cita NOT NULL,
    notas_tutor text,
    creado_por integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_citas_duracion CHECK (((duracion_min >= 15) AND (duracion_min <= 240))),
    CONSTRAINT chk_citas_individual_tutorado CHECK (((tipo = 'Grupal'::pit.tipo_cita) OR (tutorado_id IS NOT NULL))),
    CONSTRAINT chk_citas_motivo CHECK ((length(TRIM(BOTH FROM motivo)) >= 5))
);
CREATE SEQUENCE pit.citas_tutorias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.citas_tutorias_id_seq OWNED BY pit.citas_tutorias.id;
CREATE TABLE pit.evaluaciones_alumno (
    id integer NOT NULL,
    tutorado_id integer NOT NULL,
    tutor_id integer NOT NULL,
    periodo character varying(6) NOT NULL,
    respuestas jsonb NOT NULL,
    comentarios text,
    fecha_envio timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_evalal_objeto CHECK ((jsonb_typeof(respuestas) = 'object'::text)),
    CONSTRAINT chk_evalal_periodo CHECK (((periodo)::text ~ '^[0-9]{4}-[12]$'::text)),
    CONSTRAINT chk_evalal_rango CHECK ((NOT jsonb_path_exists(respuestas, '$.*?(((@.type() != "number" || @ < 1) || @ > 5) || @.floor() != @)'::jsonpath))),
    CONSTRAINT evaluaciones_alumno_comentarios_check CHECK (((comentarios IS NULL) OR (length(comentarios) <= 2000)))
);
COMMENT ON TABLE pit.evaluaciones_alumno IS 'Evaluación del acompañamiento tutorial hecha por el tutorado (secciones 4 y 5, 34 ítems Likert 1-5). Confidencial: solo coordinación.';
CREATE SEQUENCE pit.evaluaciones_alumno_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.evaluaciones_alumno_id_seq OWNED BY pit.evaluaciones_alumno.id;
CREATE TABLE pit.evaluaciones_tutor (
    id integer NOT NULL,
    tutor_id integer NOT NULL,
    periodo character varying(6) NOT NULL,
    p1 smallint NOT NULL,
    p2 smallint NOT NULL,
    p3 smallint NOT NULL,
    p4 smallint NOT NULL,
    p5 smallint NOT NULL,
    p6 smallint NOT NULL,
    p7 smallint NOT NULL,
    p8 smallint NOT NULL,
    p9 smallint NOT NULL,
    p10 smallint NOT NULL,
    p11 smallint NOT NULL,
    comentarios text,
    fecha_envio timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_eval_periodo CHECK (((periodo)::text ~ '^[0-9]{4}-[12]$'::text)),
    CONSTRAINT evaluaciones_tutor_comentarios_check CHECK (((comentarios IS NULL) OR (length(comentarios) <= 2000))),
    CONSTRAINT evaluaciones_tutor_p10_check CHECK (((p10 >= 1) AND (p10 <= 5))),
    CONSTRAINT evaluaciones_tutor_p11_check CHECK (((p11 >= 1) AND (p11 <= 5))),
    CONSTRAINT evaluaciones_tutor_p1_check CHECK (((p1 >= 1) AND (p1 <= 5))),
    CONSTRAINT evaluaciones_tutor_p2_check CHECK (((p2 >= 1) AND (p2 <= 5))),
    CONSTRAINT evaluaciones_tutor_p3_check CHECK (((p3 >= 1) AND (p3 <= 5))),
    CONSTRAINT evaluaciones_tutor_p4_check CHECK (((p4 >= 1) AND (p4 <= 5))),
    CONSTRAINT evaluaciones_tutor_p5_check CHECK (((p5 >= 1) AND (p5 <= 5))),
    CONSTRAINT evaluaciones_tutor_p6_check CHECK (((p6 >= 1) AND (p6 <= 5))),
    CONSTRAINT evaluaciones_tutor_p7_check CHECK (((p7 >= 1) AND (p7 <= 5))),
    CONSTRAINT evaluaciones_tutor_p8_check CHECK (((p8 >= 1) AND (p8 <= 5))),
    CONSTRAINT evaluaciones_tutor_p9_check CHECK (((p9 >= 1) AND (p9 <= 5)))
);
COMMENT ON TABLE pit.evaluaciones_tutor IS 'Cuestionario "Evaluación del Tutor hacia el Programa de Tutorías (PIT)": 11 reactivos Likert 1-5 (1=Siempre … 5=Nunca).';
CREATE SEQUENCE pit.evaluaciones_tutor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.evaluaciones_tutor_id_seq OWNED BY pit.evaluaciones_tutor.id;
CREATE TABLE pit.fichas_identificacion (
    id integer NOT NULL,
    tutorado_id integer NOT NULL,
    datos jsonb NOT NULL,
    estado character varying(20) DEFAULT 'Enviada'::character varying NOT NULL,
    observaciones text,
    actualizado_por integer,
    actualizado_por_rol pit.rol_usuario,
    revisada_por integer,
    fecha_revision timestamp with time zone,
    fecha_envio timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_ficha_estado CHECK (((estado)::text = ANY ((ARRAY['Enviada'::character varying, 'Revisada'::character varying, 'Requiere corrección'::character varying])::text[]))),
    CONSTRAINT chk_ficha_objeto CHECK ((jsonb_typeof(datos) = 'object'::text)),
    CONSTRAINT chk_ficha_obs CHECK (((observaciones IS NULL) OR (length(observaciones) <= 1000)))
);
COMMENT ON TABLE pit.fichas_identificacion IS 'Anexo 6 · Ficha de Identificación del tutorado. Confidencial: la llena el tutorado y la administra la Coordinación de Tutorías.';
CREATE TABLE pit.fichas_identificacion_historial (
    id integer NOT NULL,
    tutorado_id integer NOT NULL,
    usuario_id integer,
    rol pit.rol_usuario,
    accion character varying(30) NOT NULL,
    cambios jsonb,
    nota text,
    fecha timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE pit.fichas_identificacion_historial_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.fichas_identificacion_historial_id_seq OWNED BY pit.fichas_identificacion_historial.id;
CREATE SEQUENCE pit.fichas_identificacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.fichas_identificacion_id_seq OWNED BY pit.fichas_identificacion.id;
CREATE TABLE pit.perfiles_tutorado (
    tutorado_id integer NOT NULL,
    foto text,
    fecha_nacimiento date,
    ciudad_natal character varying(80),
    familia character varying(120),
    ocupacion character varying(120),
    frase character varying(160),
    objetivos text[] DEFAULT '{}'::text[] NOT NULL,
    frustraciones text[] DEFAULT '{}'::text[] NOT NULL,
    biografia text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_perfil_bio CHECK (((biografia IS NULL) OR (length(biografia) <= 1500))),
    CONSTRAINT chk_perfil_foto CHECK (((foto IS NULL) OR ((foto ~~ 'data:image/%'::text) AND (length(foto) <= 400000)))),
    CONSTRAINT chk_perfil_listas CHECK (((cardinality(objetivos) <= 6) AND (cardinality(frustraciones) <= 6))),
    CONSTRAINT chk_perfil_nacimiento CHECK (((fecha_nacimiento IS NULL) OR ((fecha_nacimiento >= '1950-01-01'::date) AND (fecha_nacimiento <= '2015-12-31'::date))))
);
COMMENT ON TABLE pit.perfiles_tutorado IS 'Perfil tipo "persona" (UX) del tutorado: contexto personal, objetivos y frustraciones.';
CREATE TABLE pit.reportes_pit (
    id integer NOT NULL,
    tutorado_id integer NOT NULL,
    periodo character varying(6) NOT NULL,
    tipo_formato pit.tipo_formato_pit NOT NULL,
    archivo_url text,
    contenido_json jsonb,
    fecha_subida timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_reportes_contenido CHECK (((archivo_url IS NOT NULL) OR (contenido_json IS NOT NULL))),
    CONSTRAINT chk_reportes_periodo CHECK (((periodo)::text ~ '^[0-9]{4}-[12]$'::text))
);
CREATE SEQUENCE pit.reportes_pit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.reportes_pit_id_seq OWNED BY pit.reportes_pit.id;
CREATE TABLE pit.tutor_horarios (
    id integer NOT NULL,
    tutor_id integer NOT NULL,
    dia_semana smallint NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fin time without time zone NOT NULL,
    CONSTRAINT chk_horario_rango CHECK (((hora_fin > hora_inicio) AND (hora_inicio >= '07:00:00'::time without time zone) AND (hora_fin <= '20:00:00'::time without time zone))),
    CONSTRAINT tutor_horarios_dia_semana_check CHECK (((dia_semana >= 1) AND (dia_semana <= 5)))
);
CREATE SEQUENCE pit.tutor_horarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.tutor_horarios_id_seq OWNED BY pit.tutor_horarios.id;
CREATE TABLE pit.tutorados (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    carrera character varying(80) DEFAULT 'Ingeniería en Sistemas Computacionales'::character varying NOT NULL,
    semestre smallint NOT NULL,
    periodo_ingreso character varying(6) NOT NULL,
    estatus_academico pit.estatus_academico DEFAULT 'Regular'::pit.estatus_academico NOT NULL,
    nivel_riesgo pit.nivel_riesgo DEFAULT 'BAJO'::pit.nivel_riesgo NOT NULL,
    materias_reprobadas smallint DEFAULT 0 NOT NULL,
    avance_reticular_pct numeric(5,2) DEFAULT 0 NOT NULL,
    promedio numeric(5,2),
    telefono character varying(15),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_tutorados_avance CHECK (((avance_reticular_pct >= (0)::numeric) AND (avance_reticular_pct <= (100)::numeric))),
    CONSTRAINT chk_tutorados_periodo CHECK (((periodo_ingreso)::text ~ '^[0-9]{4}-[12]$'::text)),
    CONSTRAINT chk_tutorados_promedio CHECK (((promedio IS NULL) OR ((promedio >= (0)::numeric) AND (promedio <= (100)::numeric)))),
    CONSTRAINT chk_tutorados_reprobadas CHECK ((materias_reprobadas >= 0)),
    CONSTRAINT chk_tutorados_semestre CHECK (((semestre >= 1) AND (semestre <= 12)))
);
CREATE SEQUENCE pit.tutorados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.tutorados_id_seq OWNED BY pit.tutorados.id;
CREATE TABLE pit.tutores (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    departamento character varying(80) DEFAULT 'Sistemas y Computación'::character varying NOT NULL,
    cubiculo character varying(40),
    max_tutorados smallint DEFAULT 40 NOT NULL,
    formacion_tutorial character varying(60),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    presentacion text,
    areas_apoyo text[] DEFAULT '{}'::text[] NOT NULL,
    acepta_tutorados boolean DEFAULT true NOT NULL,
    foto text,
    grado_academico character varying(120),
    especialidad character varying(120),
    anios_experiencia smallint,
    frase character varying(160),
    enfoque text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT chk_tutores_enfoque CHECK ((cardinality(enfoque) <= 6)),
    CONSTRAINT chk_tutores_experiencia CHECK (((anios_experiencia IS NULL) OR ((anios_experiencia >= 0) AND (anios_experiencia <= 60)))),
    CONSTRAINT chk_tutores_foto CHECK (((foto IS NULL) OR ((foto ~~ 'data:image/%'::text) AND (length(foto) <= 400000)))),
    CONSTRAINT chk_tutores_max CHECK (((max_tutorados >= 1) AND (max_tutorados <= 60))),
    CONSTRAINT chk_tutores_presentacion CHECK (((presentacion IS NULL) OR (length(presentacion) <= 1500)))
);
CREATE SEQUENCE pit.tutores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.tutores_id_seq OWNED BY pit.tutores.id;
CREATE TABLE pit.usuarios (
    id integer NOT NULL,
    no_control_o_rfc character varying(13) NOT NULL,
    nombre character varying(80) NOT NULL,
    apellidos character varying(120) NOT NULL,
    correo_institucional character varying(120) NOT NULL,
    password_hash character varying(255) NOT NULL,
    rol pit.rol_usuario NOT NULL,
    estado pit.estado_usuario DEFAULT 'activo'::pit.estado_usuario NOT NULL,
    ultimo_acceso timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_usuarios_control_rfc CHECK (((no_control_o_rfc)::text ~ '^([A-Z]?[0-9]{8,9}|[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2,3})$'::text)),
    CONSTRAINT chk_usuarios_correo_dominio CHECK (((correo_institucional)::text ~* '^[a-z0-9._%+-]+@veracruz\.tecnm\.mx$'::text))
);
COMMENT ON TABLE pit.usuarios IS 'Cuentas de acceso: alumnos (tutorados), docentes tutores y coordinación PIT.';
CREATE SEQUENCE pit.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pit.usuarios_id_seq OWNED BY pit.usuarios.id;
CREATE VIEW pit.v_tutorados_detalle AS
 SELECT t.id AS tutorado_id,
    u.id AS usuario_id,
    u.no_control_o_rfc AS no_control,
    u.nombre,
    u.apellidos,
    (((u.apellidos)::text || ' '::text) || (u.nombre)::text) AS nombre_completo,
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
    (((ut.nombre)::text || ' '::text) || (ut.apellidos)::text) AS tutor_nombre
   FROM ((((pit.tutorados t
     JOIN pit.usuarios u ON ((u.id = t.usuario_id)))
     LEFT JOIN pit.asignaciones_tutoria a ON (((a.tutorado_id = t.id) AND (a.estatus_asignacion = 'Activa'::pit.estatus_asignacion))))
     LEFT JOIN pit.tutores tu ON ((tu.id = a.tutor_id)))
     LEFT JOIN pit.usuarios ut ON ((ut.id = tu.usuario_id)));
ALTER TABLE ONLY pit.asignaciones_tutoria ALTER COLUMN id SET DEFAULT nextval('pit.asignaciones_tutoria_id_seq'::regclass);
ALTER TABLE ONLY pit.avisos ALTER COLUMN id SET DEFAULT nextval('pit.avisos_id_seq'::regclass);
ALTER TABLE ONLY pit.canalizaciones ALTER COLUMN id SET DEFAULT nextval('pit.canalizaciones_id_seq'::regclass);
ALTER TABLE ONLY pit.citas_tutorias ALTER COLUMN id SET DEFAULT nextval('pit.citas_tutorias_id_seq'::regclass);
ALTER TABLE ONLY pit.evaluaciones_alumno ALTER COLUMN id SET DEFAULT nextval('pit.evaluaciones_alumno_id_seq'::regclass);
ALTER TABLE ONLY pit.evaluaciones_tutor ALTER COLUMN id SET DEFAULT nextval('pit.evaluaciones_tutor_id_seq'::regclass);
ALTER TABLE ONLY pit.fichas_identificacion ALTER COLUMN id SET DEFAULT nextval('pit.fichas_identificacion_id_seq'::regclass);
ALTER TABLE ONLY pit.fichas_identificacion_historial ALTER COLUMN id SET DEFAULT nextval('pit.fichas_identificacion_historial_id_seq'::regclass);
ALTER TABLE ONLY pit.reportes_pit ALTER COLUMN id SET DEFAULT nextval('pit.reportes_pit_id_seq'::regclass);
ALTER TABLE ONLY pit.tutor_horarios ALTER COLUMN id SET DEFAULT nextval('pit.tutor_horarios_id_seq'::regclass);
ALTER TABLE ONLY pit.tutorados ALTER COLUMN id SET DEFAULT nextval('pit.tutorados_id_seq'::regclass);
ALTER TABLE ONLY pit.tutores ALTER COLUMN id SET DEFAULT nextval('pit.tutores_id_seq'::regclass);
ALTER TABLE ONLY pit.usuarios ALTER COLUMN id SET DEFAULT nextval('pit.usuarios_id_seq'::regclass);
INSERT INTO pit.asignaciones_tutoria VALUES (9, 1, 1, '2026-1', '3°B ISC', 'Finalizada', '2026-01-26', '2026-11-04 03:51:44.101315+00', 'Coordinación');
INSERT INTO pit.asignaciones_tutoria VALUES (10, 1, 2, '2026-1', '3°B ISC', 'Finalizada', '2026-01-26', '2026-11-04 03:51:44.101315+00', 'Coordinación');
INSERT INTO pit.asignaciones_tutoria VALUES (11, 1, 3, '2026-1', '3°B ISC', 'Finalizada', '2026-01-26', '2026-11-04 03:51:44.101315+00', 'Coordinación');
INSERT INTO pit.asignaciones_tutoria VALUES (4, 1, 1, '2026-2', '4°B ISC', 'Activa', '2026-08-24', '2026-11-04 03:51:44.101315+00', 'Elección del tutorado');
INSERT INTO pit.asignaciones_tutoria VALUES (3, 1, 2, '2026-2', '4°B ISC', 'Activa', '2026-08-24', '2026-11-04 03:51:44.101315+00', 'Elección del tutorado');
INSERT INTO pit.asignaciones_tutoria VALUES (2, 1, 3, '2026-2', '4°B ISC', 'Activa', '2026-08-24', '2026-11-04 03:51:44.101315+00', 'Elección del tutorado');
INSERT INTO pit.asignaciones_tutoria VALUES (1, 1, 4, '2026-2', '4°B ISC', 'Activa', '2026-08-24', '2026-11-04 03:51:44.101315+00', 'Elección del tutorado');
INSERT INTO pit.asignaciones_tutoria VALUES (8, 2, 5, '2026-2', '6°A ISC', 'Activa', '2026-08-24', '2026-11-04 03:51:44.101315+00', 'Elección del tutorado');
INSERT INTO pit.asignaciones_tutoria VALUES (7, 2, 6, '2026-2', '6°A ISC', 'Activa', '2026-08-24', '2026-11-04 03:51:44.101315+00', 'Elección del tutorado');
INSERT INTO pit.asignaciones_tutoria VALUES (6, 2, 7, '2026-2', '2°A ISC', 'Activa', '2026-08-24', '2026-11-04 03:51:44.101315+00', 'Elección del tutorado');
INSERT INTO pit.asignaciones_tutoria VALUES (5, 2, 8, '2026-2', '2°A ISC', 'Activa', '2026-08-24', '2026-11-04 03:51:44.101315+00', 'Elección del tutorado');
INSERT INTO pit.avisos VALUES (1, 'Talleres de Reforzamiento en Estructuras de Datos y Matemáticas Discretas', 'Canalización Académica', 'Inscripciones abiertas en el cubículo de tutorías del Departamento de Sistemas. Canalicen a los tutorados con 2 o más asignaturas reprobadas.', false, 'Publicado', 1, '2026-10-30 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00');
INSERT INTO pit.avisos VALUES (2, 'Periodo de Evaluaciones Parciales y Reporte de Tutorados en Riesgo', 'Coordinación de Tutorías', 'Se recuerda a los tutores realizar sus sesiones obligatorias y reportar a los tutorados en riesgo antes del cierre del segundo corte evaluativo.', true, 'Publicado', 1, '2026-11-02 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00');
INSERT INTO pit.avisos VALUES (3, 'Entrega del Reporte Semestral del Tutor', 'Coordinación de Tutorías', 'La fecha límite para entregar el reporte semestral y las actas de acreditación es el 12 de diciembre de 2026.', false, 'Borrador', 1, NULL, '2026-11-04 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00');
INSERT INTO pit.canalizaciones VALUES (1, 1, 1, 'PALPROG', 'Deficiencia severa en punteros y arreglos dinámicos (Estructura de Datos).', 'En Proceso', 'Asiste martes y jueves a asesoría PALPROG.', '2026-10-25 03:51:44.101315+00', NULL, '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.canalizaciones VALUES (2, 2, 1, 'CEPC', 'Interés en lógica matemática; reforzamiento de Matemáticas Discretas mediante problemas competitivos.', 'Aceptado', NULL, '2026-10-21 03:51:44.101315+00', NULL, '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.canalizaciones VALUES (3, 5, 2, 'PALPROG', 'Rezago en Programación Orientada a Objetos y Tópicos Avanzados de Programación.', 'Pendiente', NULL, '2026-11-01 03:51:44.101315+00', NULL, '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.canalizaciones VALUES (4, 5, 2, 'Psicología/Salud', 'Reporta estrés y ansiedad ante evaluaciones; se sugiere orientación psicopedagógica.', 'En Proceso', 'Primera entrevista realizada en Desarrollo Académico.', '2026-10-29 03:51:44.101315+00', NULL, '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.canalizaciones VALUES (5, 6, 2, 'CIS', 'Busca integrarse a proyectos de la comunidad para fortalecer su perfil de residencia.', 'Atendido', 'Integrada al proyecto de la app de servicio social de la CIS.', '2026-10-05 03:51:44.101315+00', '2026-11-02 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.canalizaciones VALUES (6, 7, 2, 'PAPAs', 'Dificultad en Cálculo Diferencial; se asigna asesor par de 6° semestre.', 'Pendiente', NULL, '2026-11-03 03:51:44.101315+00', NULL, '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.citas_tutorias VALUES (1, 1, NULL, '2026-10-30 18:00:00+00', 60, 'Grupal', 'Presencial', '4°B ISC', 'Inducción a Comunidades de Apoyo Académico (PALPROG y CIS).', 'Completada', 'Asistieron 31 de 35 tutorados. Se compartieron horarios de PALPROG.', 2, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.citas_tutorias VALUES (2, 1, 4, '2026-11-04 22:00:00+00', 60, 'Individual', 'Presencial', NULL, 'Rezago reticular: plan para recuperar Cálculo Diferencial.', 'Pendiente', NULL, 8, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.citas_tutorias VALUES (3, 1, 3, '2026-11-06 16:00:00+00', 60, 'Individual', 'Presencial', NULL, 'Revisión de avance reticular.', 'Confirmada', NULL, 7, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.citas_tutorias VALUES (4, 1, 3, '2026-10-12 16:00:00+00', 60, 'Individual', 'Presencial', NULL, 'Diagnóstico de primer parcial.', 'Completada', 'Desempeño sobresaliente. Se recomienda integrarse a CEPC.', 7, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.citas_tutorias VALUES (5, 1, 2, '2026-11-05 17:00:00+00', 60, 'Individual', 'Línea', NULL, 'Orientación sobre retícula y carga de materias para 5° semestre.', 'Confirmada', NULL, 6, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.citas_tutorias VALUES (6, 1, 1, '2026-11-03 16:00:00+00', 60, 'Individual', 'Presencial', NULL, 'Estrategia de recuperación en Estructura de Datos y acuerdo de tutoría.', 'Pendiente', NULL, 5, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.citas_tutorias VALUES (7, 2, 7, '2026-11-11 22:00:00+00', 60, 'Individual', 'Línea', NULL, 'Hábitos de estudio y adaptación al segundo semestre.', 'Pendiente', NULL, 11, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.citas_tutorias VALUES (8, 2, 6, '2026-10-28 17:00:00+00', 60, 'Individual', 'Línea', NULL, 'Revisión de opciones de residencia profesional.', 'Cancelada', 'Cancelada por la alumna; se reprogramará.', 10, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.citas_tutorias VALUES (9, 2, 5, '2026-11-03 19:00:00+00', 60, 'Individual', 'Presencial', NULL, 'Seguimiento de bajo rendimiento: 4 asignaturas reprobadas, revisión de carga académica.', 'Pendiente', NULL, 9, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.evaluaciones_alumno VALUES (1, 2, 1, '2026-2', '{"s4a": 2, "s4b": 3, "s4c": 1, "s4d": 2, "s4e": 3, "s4f": 1, "s4g": 2, "s4h": 3, "s4i": 1, "s4j": 2, "s4k": 3, "s4l": 1, "s4m": 2, "s4n": 3, "s4o": 1, "s4p": 2, "s5a": 3, "s5b": 1, "s5c": 2, "s5d": 3, "s5e": 1, "s5f": 2, "s5g": 3, "s5h": 1, "s5i": 2, "s5j": 3, "s5k": 1, "s5l": 2, "s5m": 3, "s5n": 1, "s5o": 2, "s5p": 3, "s5q": 1, "s5r": 2}', 'Me gustaría que las sesiones grupales fueran más frecuentes.', '2026-11-02 03:51:44.896359+00', '2026-11-04 03:51:44.896359+00');
INSERT INTO pit.evaluaciones_alumno VALUES (2, 3, 1, '2026-2', '{"s4a": 2, "s4b": 1, "s4c": 2, "s4d": 1, "s4e": 2, "s4f": 1, "s4g": 2, "s4h": 1, "s4i": 2, "s4j": 1, "s4k": 2, "s4l": 1, "s4m": 2, "s4n": 1, "s4o": 2, "s4p": 1, "s5a": 2, "s5b": 1, "s5c": 2, "s5d": 1, "s5e": 2, "s5f": 1, "s5g": 2, "s5h": 1, "s5i": 2, "s5j": 1, "s5k": 2, "s5l": 1, "s5m": 2, "s5n": 1, "s5o": 2, "s5p": 1, "s5q": 2, "s5r": 1}', 'Mi tutora siempre está disponible y me recomendó integrarme a CEPC.', '2026-10-31 03:51:44.896359+00', '2026-11-04 03:51:44.896359+00');
INSERT INTO pit.evaluaciones_alumno VALUES (3, 6, 2, '2026-2', '{"s4a": 3, "s4b": 4, "s4c": 5, "s4d": 2, "s4e": 3, "s4f": 4, "s4g": 5, "s4h": 2, "s4i": 3, "s4j": 4, "s4k": 5, "s4l": 2, "s4m": 3, "s4n": 4, "s4o": 5, "s4p": 2, "s5a": 3, "s5b": 4, "s5c": 5, "s5d": 2, "s5e": 3, "s5f": 4, "s5g": 5, "s5h": 2, "s5i": 3, "s5j": 4, "s5k": 5, "s5l": 2, "s5m": 3, "s5n": 4, "s5o": 5, "s5p": 2, "s5q": 3, "s5r": 4}', NULL, '2026-11-03 03:51:44.896359+00', '2026-11-04 03:51:44.896359+00');
INSERT INTO pit.evaluaciones_tutor VALUES (1, 2, '2026-2', 2, 3, 1, 2, 4, 1, 1, 3, 4, 2, 3, 'Se requiere un cubículo con mejor ventilación y horarios de PALPROG compatibles con 6° semestre.', '2026-11-01 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.evaluaciones_tutor VALUES (2, 1, '2026-1', 1, 2, 1, 2, 3, 1, 1, 2, 3, 1, 2, NULL, '2026-06-05 18:00:00+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.fichas_identificacion VALUES (1, 2, '{"sexo": "Mujer", "fecha": "2026-09-01", "becado": "Sí", "correo": "andrea.ml@gmail.com", "carrera": "Ingeniería en Sistemas Computacionales", "empresa": "", "nombres": "Andrea", "trabaja": "No", "celular1": "2291234567", "celular2": "", "semestre": 4, "domicilio": "Av. Díaz Mirón 1450, Col. Centro, Veracruz, Ver., C.P. 91700", "num_hijos": 0, "madre_vive": "Vive", "padre_vive": "Vive", "tipos_beca": ["Gobierno federal"], "vivira_con": "Con mi familia", "escolaridad": "Bachillerato técnico", "estado_civil": "Soltero(a)", "tel_domicilio": "2299345678", "trabajo_madre": "Hogar", "trabajo_padre": "Puerto de Veracruz (API)", "horario_trabajo": "", "apellido_materno": "López", "apellido_paterno": "Martínez", "beca_institucion": "Beca Benito Juárez", "fecha_nacimiento": "2006-04-12", "lugar_nacimiento": "Boca del Río, Ver.", "emergencia_nombre": "Rosa López Hernández", "escolaridad_madre": "Preparatoria", "escolaridad_padre": "Licenciatura", "estado_civil_otro": "", "emergencia_telefono": "2297654321", "institucion_procedencia": "CBTIS 79"}', 'Revisada', NULL, 6, 'alumno', 1, '2026-10-16 03:51:45.123913+00', '2026-10-15 03:51:45.123913+00', '2026-11-04 03:51:45.123913+00');
INSERT INTO pit.fichas_identificacion VALUES (2, 3, '{"sexo": "Hombre", "fecha": "2026-09-05", "becado": "No", "correo": "juanps@outlook.com", "carrera": "Ingeniería en Sistemas Computacionales", "empresa": "Cafetería La Parroquia", "nombres": "Juan", "trabaja": "Sí", "celular1": "2293456789", "celular2": "", "semestre": 4, "domicilio": "Calle Arista 320 int. 4, Col. Formando Hogar, Veracruz, Ver.", "num_hijos": 0, "madre_vive": "Vive", "padre_vive": "Finado", "tipos_beca": [], "vivira_con": "Con otros estudiantes", "escolaridad": "Preparatoria", "estado_civil": "Soltero(a)", "tel_domicilio": "", "trabajo_madre": "Hospital Regional de Xalapa", "trabajo_padre": "", "horario_trabajo": "Sáb y Dom 8:00–16:00", "apellido_materno": "Sánchez", "apellido_paterno": "Pérez", "beca_institucion": "", "fecha_nacimiento": "2005-11-30", "lugar_nacimiento": "Xalapa, Ver.", "emergencia_nombre": "María Sánchez Ortiz", "escolaridad_madre": "Técnico", "escolaridad_padre": "Secundaria", "estado_civil_otro": "", "emergencia_telefono": "228123456", "institucion_procedencia": "Colegio Preparatorio de Xalapa"}', 'Requiere corrección', 'El teléfono de emergencia tiene 9 dígitos; corrígelo por favor.', 7, 'alumno', 1, '2026-10-24 03:51:45.123913+00', '2026-10-23 03:51:45.123913+00', '2026-11-04 03:51:45.123913+00');
INSERT INTO pit.fichas_identificacion VALUES (3, 7, '{"sexo": "Mujer", "fecha": "2026-10-15", "becado": "Sí", "correo": "vale.torres@gmail.com", "carrera": "Ingeniería en Sistemas Computacionales", "empresa": "", "nombres": "Valeria", "trabaja": "No", "celular1": "2295551122", "celular2": "2295553344", "semestre": 2, "domicilio": "Fracc. Costa Verde, Calle Gaviota 18, Boca del Río, Ver.", "num_hijos": 0, "madre_vive": "Vive", "padre_vive": "Vive", "tipos_beca": ["Gobierno estatal", "Esfuerzos de bachillerato"], "vivira_con": "Con mi familia", "escolaridad": "Preparatoria", "estado_civil": "Soltero(a)", "tel_domicilio": "", "trabajo_madre": "Despacho contable propio", "trabajo_padre": "Universidad Veracruzana", "horario_trabajo": "", "apellido_materno": "Méndez", "apellido_paterno": "Torres", "beca_institucion": "Instituto Veracruzano", "fecha_nacimiento": "2008-02-20", "lugar_nacimiento": "Veracruz, Ver.", "emergencia_nombre": "Jorge Torres Ruiz", "escolaridad_madre": "Licenciatura", "escolaridad_padre": "Posgrado", "estado_civil_otro": "", "emergencia_telefono": "2299887766", "institucion_procedencia": "Instituto Veracruzano"}', 'Enviada', NULL, 11, 'alumno', NULL, NULL, '2026-11-02 03:51:45.123913+00', '2026-11-04 03:51:45.123913+00');
INSERT INTO pit.fichas_identificacion_historial VALUES (1, 2, 6, 'alumno', 'Envío', NULL, NULL, '2026-10-15 03:51:45.123913+00');
INSERT INTO pit.fichas_identificacion_historial VALUES (2, 3, 7, 'alumno', 'Envío', NULL, NULL, '2026-10-23 03:51:45.123913+00');
INSERT INTO pit.fichas_identificacion_historial VALUES (3, 7, 11, 'alumno', 'Envío', NULL, NULL, '2026-11-02 03:51:45.123913+00');
INSERT INTO pit.fichas_identificacion_historial VALUES (4, 2, 1, 'coordinador', 'Revisión', NULL, NULL, '2026-10-16 03:51:45.123913+00');
INSERT INTO pit.fichas_identificacion_historial VALUES (5, 3, 1, 'coordinador', 'Solicitud de corrección', NULL, 'El teléfono de emergencia tiene 9 dígitos; corrígelo por favor.', '2026-10-24 03:51:45.123913+00');
INSERT INTO pit.perfiles_tutorado VALUES (1, NULL, '2005-03-14', 'Boca del Río, Ver.', 'Vive con sus padres y una hermana menor', 'Estudiante ISC; trabaja 20 h por semana en una tienda', 'Quiero terminar la carrera aunque me cueste más tiempo', '{"Acreditar Estructura de Datos en recursamiento","Organizar mejor su tiempo entre trabajo y escuela","No volver a reprobar asignaturas"}', '{"El horario de trabajo choca con las asesorías","Siente que se atrasa respecto a su generación"}', 'Carlos cursa 4.° semestre. Trabaja por las tardes para apoyar en casa y eso le ha dificultado asistir a asesorías. Busca un tutor con horario de mañana que le ayude a planear su retícula.', '2026-11-04 03:51:45.101936+00');
INSERT INTO pit.perfiles_tutorado VALUES (3, NULL, '2005-09-02', 'Veracruz, Ver.', 'Vive con sus padres', 'Estudiante ISC', 'La constancia vale más que el talento', '{"Mantener su promedio arriba de 90","Participar en concursos de programación","Conseguir una beca de movilidad"}', '{"Pocas opciones de actividades extracurriculares en su horario"}', 'Juan es alumno regular de 4.° semestre con interés en desarrollo web y tecnologías emergentes.', '2026-11-04 03:51:45.101936+00');
INSERT INTO pit.reportes_pit VALUES (1, 1, '2026-2', 'PlanTrabajo', NULL, '{"acciones": ["PALPROG 2 veces por semana", "Entrega de prácticas en tiempo"], "objetivo": "Acreditar Estructura de Datos en recursamiento", "compromiso_firmado": true}', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.reportes_pit VALUES (2, 1, '2026-2', 'FichaIdentificacion', NULL, '{"beca": "Benito Juárez", "trabaja": true, "vive_con": "Padres", "intereses": ["Desarrollo web"], "horas_trabajo_semana": 20}', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.reportes_pit VALUES (3, 3, '2026-1', 'ReporteSemestral', '/uploads/reportes/2026-1/25020345-reporte-semestral.pdf', NULL, '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.reportes_pit VALUES (4, 3, '2026-2', 'FichaIdentificacion', NULL, '{"trabaja": false, "vive_con": "Padres", "intereses": ["Desarrollo Web", "Tecnologías Emergentes"]}', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.reportes_pit VALUES (5, 5, '2026-2', 'FichaIdentificacion', NULL, '{"beca": null, "trabaja": true, "vive_con": "Solo", "intereses": ["Redes"], "horas_trabajo_semana": 30}', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.tutor_horarios VALUES (1, 1, 1, '10:00:00', '12:00:00');
INSERT INTO pit.tutor_horarios VALUES (2, 1, 2, '10:00:00', '12:00:00');
INSERT INTO pit.tutor_horarios VALUES (3, 1, 3, '16:00:00', '18:00:00');
INSERT INTO pit.tutor_horarios VALUES (4, 1, 4, '11:00:00', '13:00:00');
INSERT INTO pit.tutor_horarios VALUES (5, 1, 5, '10:00:00', '12:00:00');
INSERT INTO pit.tutor_horarios VALUES (6, 2, 2, '13:00:00', '15:00:00');
INSERT INTO pit.tutor_horarios VALUES (7, 2, 3, '16:00:00', '18:00:00');
INSERT INTO pit.tutor_horarios VALUES (8, 2, 4, '11:00:00', '13:00:00');
INSERT INTO pit.tutor_horarios VALUES (9, 3, 1, '13:00:00', '15:00:00');
INSERT INTO pit.tutor_horarios VALUES (10, 3, 2, '13:00:00', '15:00:00');
INSERT INTO pit.tutor_horarios VALUES (11, 3, 3, '13:00:00', '15:00:00');
INSERT INTO pit.tutor_horarios VALUES (12, 3, 4, '13:00:00', '15:00:00');
INSERT INTO pit.tutor_horarios VALUES (13, 3, 5, '13:00:00', '15:00:00');
INSERT INTO pit.tutorados VALUES (1, 5, 'Ingeniería en Sistemas Computacionales', 4, '2025-1', 'Irregular', 'CRÍTICO', 3, 19.00, 68.50, '2291234501', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.tutorados VALUES (2, 6, 'Ingeniería en Sistemas Computacionales', 4, '2025-1', 'Irregular', 'ALTO', 2, 26.00, 74.20, '2291234502', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.tutorados VALUES (3, 7, 'Ingeniería en Sistemas Computacionales', 4, '2025-1', 'Regular', 'BAJO', 0, 42.30, 92.40, '2295551234', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.tutorados VALUES (4, 8, 'Ingeniería en Sistemas Computacionales', 4, '2025-1', 'Irregular', 'ALTO', 1, 14.00, 77.80, '2291234504', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.tutorados VALUES (5, 9, 'Ingeniería en Sistemas Computacionales', 6, '2024-1', 'Irregular', 'CRÍTICO', 4, 31.00, 66.00, '2291234505', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.tutorados VALUES (6, 10, 'Ingeniería en Sistemas Computacionales', 6, '2024-1', 'Irregular', 'MEDIO', 1, 52.00, 81.30, '2291234506', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.tutorados VALUES (7, 11, 'Ingeniería en Sistemas Computacionales', 2, '2026-1', 'Irregular', 'ALTO', 2, 6.00, 71.90, '2291234507', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.tutorados VALUES (8, 12, 'Ingeniería en Sistemas Computacionales', 2, '2026-1', 'Regular', 'BAJO', 0, 11.00, 88.70, '2291234508', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.tutorados VALUES (9, 13, 'Ingeniería en Sistemas Computacionales', 1, '2026-2', 'Regular', 'BAJO', 0, 0.00, NULL, '2291234511', '2026-11-04 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00');
INSERT INTO pit.tutorados VALUES (10, 14, 'Ingeniería en Sistemas Computacionales', 1, '2026-2', 'Regular', 'BAJO', 0, 0.00, NULL, '2291234512', '2026-11-04 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00');
INSERT INTO pit.tutorados VALUES (11, 15, 'Ingeniería en Sistemas Computacionales', 3, '2025-2', 'Irregular', 'MEDIO', 1, 20.00, 79.40, '2291234513', '2026-11-04 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00');
INSERT INTO pit.tutores VALUES (1, 2, 'Sistemas y Computación', 'Cubículo 12, Edificio U', 6, 'Diplomado Cumplido', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:45.118722+00', 'Ingeniera en Sistemas con maestría en Tecnologías de la Información. Acompaño a mis tutorados en la planeación de su carga académica y en el desarrollo de proyectos web.', '{"Desarrollo web","Planeación de retícula","Hábitos de estudio"}', true, NULL, 'Maestría en Tecnologías de la Información', 'Desarrollo web', 15, 'Cada estudiante avanza a su ritmo; mi trabajo es que no avance solo', '{"Planear tu carga académica y retícula","Recuperar asignaturas reprobadas","Mejorar hábitos de estudio"}');
INSERT INTO pit.tutores VALUES (2, 3, 'Sistemas y Computación', 'Cubículo 7, Edificio U', 6, 'Diplomado Cumplido', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:45.118722+00', 'Doctora en Ciencias de la Computación. Me enfoco en estudiantes con rezago en programación y en la preparación para residencias profesionales.', '{Programación,"Residencia profesional",Investigación}', true, NULL, 'Doctorado en Ciencias de la Computación', 'Algoritmos y programación', 12, 'Programar se aprende programando', '{"Reforzar lógica y programación","Preparar tu residencia profesional","Iniciarte en investigación"}');
INSERT INTO pit.tutores VALUES (3, 4, 'Sistemas y Computación', 'Cubículo 3, Edificio U', 8, 'Cursos Básicos', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:45.118722+00', 'Maestro en Redes y Sistemas Operativos. Apoyo la integración de alumnos de primeros semestres y la orientación sobre servicio social y becas.', '{Redes,"Nuevo ingreso","Trámites y becas"}', true, NULL, 'Maestría en Redes y Sistemas Operativos', 'Redes de computadoras', 8, 'La universidad es más fácil cuando sabes a quién acudir', '{"Adaptarte al primer semestre","Trámites, becas y servicio social","Orientarte sobre áreas de especialidad"}');
INSERT INTO pit.usuarios VALUES (1, 'RIML780214KJ2', 'Laura Elena', 'Rivas Montiel', 'coordinacion.tutorias@veracruz.tecnm.mx', '$2a$10$5UlBTIe22Ad8qXH70mqFOO.YplzcTSES5DvjD8rju4Vl.7L/qEm2u', 'coordinador', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (3, 'PEMK800312XX4', 'Karla Gabriela', 'Peralta Madrigal', 'karla.pm@veracruz.tecnm.mx', '$2a$10$LktQ65tEMMsW/9bWwItqnOngINNgIINLsbO8sFQM/RFcwLaHVI1R.', 'tutor', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (4, 'GOFR751102XX9', 'Roberto', 'Gómez Fernández', 'roberto.gf@veracruz.tecnm.mx', '$2a$10$LbemkeWEVzRidFVqLxQYveu0Cja.GXLuxV.CJHkmkaTNI08EyQns.', 'tutor', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (5, '25020112', 'Carlos', 'García Hernández', 'l25020112@veracruz.tecnm.mx', '$2a$10$BUlViYbmuJS9LvUNkkE6AeioY7KbPUY7bYtN0zBOaJHVaq.0HaQcy', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (6, '25020204', 'Andrea', 'Martínez López', 'l25020204@veracruz.tecnm.mx', '$2a$10$aNzSJZf8DpLlf4dtVk3cE.Zf2tLxv8KyNVFWptDzQ2KuP7kFXeL2q', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (7, '25020345', 'Juan', 'Pérez Sánchez', 'l25020345@veracruz.tecnm.mx', '$2a$10$v2rsJeXCs8Q3kc/1dkrcqeTexnPQEhn/8X/mkNj8txdZcsh15lHZC', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (8, '25020431', 'Ximena', 'Morales Vázquez', 'l25020431@veracruz.tecnm.mx', '$2a$10$bSwzcmjnMmJD2NqGqXhpBOUiKEoKBPDA2CEiu2Y8W5BRF.8LorHR2', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (9, '24020418', 'Luis Fernando', 'Ramírez Ortiz', 'l24020418@veracruz.tecnm.mx', '$2a$10$3g04wFx42aLt89wtFkjgJeNx4QCi71CiHOHE2/Nn8clLRUlVK0q6G', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (10, '24020527', 'Sofía', 'Cruz Domínguez', 'l24020527@veracruz.tecnm.mx', '$2a$10$LZPUrEEQPqmQ3.UYaLL2F.Q/M0gcnXLEt7ihmURPZp9gPsjdcY5gy', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (11, '26020133', 'Valeria', 'Torres Méndez', 'l26020133@veracruz.tecnm.mx', '$2a$10$qHY6OFBRH5Um5.Ap7Wraa.1GYyrtqnv7.XFom17nVmnW8cjK1YjX.', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (12, '26020210', 'Diego', 'Hernández Aguilar', 'l26020210@veracruz.tecnm.mx', '$2a$10$FoEFTGcIZY1n.OrQkktxn.FwQrkTihpcZ4ccMWw1pRmmmAqt4A7a6', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:44.101315+00');
INSERT INTO pit.usuarios VALUES (13, '26020301', 'Mariana', 'López Rivera', 'l26020301@veracruz.tecnm.mx', '$2a$10$J42O4.41cX70w2ILGgkTdu5qgZvE5bGXbP4lDspTbBs7SQ.NsNP/6', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00');
INSERT INTO pit.usuarios VALUES (14, '26020318', 'Emiliano', 'Castro Ruiz', 'l26020318@veracruz.tecnm.mx', '$2a$10$9eUq9h9VZOaXAMVwebBO5.bYX9mRd99x29T0t9Kykvk.j1oWSgrXi', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00');
INSERT INTO pit.usuarios VALUES (15, '25020477', 'Fernanda', 'Ortega Lara', 'l25020477@veracruz.tecnm.mx', '$2a$10$CtNqoHuwfbQR5OtBZOrREOFlsYl32C02q7byYweOinVaGTNtRFadK', 'alumno', 'activo', NULL, '2026-11-04 03:51:44.901601+00', '2026-11-04 03:51:44.901601+00');
INSERT INTO pit.usuarios VALUES (2, 'TEPN720815XX1', 'Noemí del Carmen', 'Tenorio Prieto', 'noemi.tp@veracruz.tecnm.mx', '$2a$10$FQXulqTEiOPOgumES028VOfUsNO8wwZpo8vB5cX6gans5/wX/1XRm', 'tutor', 'activo', '2026-11-04 03:51:54.030185+00', '2026-11-04 03:51:44.101315+00', '2026-11-04 03:51:54.030185+00');
SELECT pg_catalog.setval('pit.asignaciones_tutoria_id_seq', 11, true);
SELECT pg_catalog.setval('pit.avisos_id_seq', 3, true);
SELECT pg_catalog.setval('pit.canalizaciones_id_seq', 6, true);
SELECT pg_catalog.setval('pit.citas_tutorias_id_seq', 9, true);
SELECT pg_catalog.setval('pit.evaluaciones_alumno_id_seq', 3, true);
SELECT pg_catalog.setval('pit.evaluaciones_tutor_id_seq', 2, true);
SELECT pg_catalog.setval('pit.fichas_identificacion_historial_id_seq', 5, true);
SELECT pg_catalog.setval('pit.fichas_identificacion_id_seq', 3, true);
SELECT pg_catalog.setval('pit.reportes_pit_id_seq', 5, true);
SELECT pg_catalog.setval('pit.tutor_horarios_id_seq', 13, true);
SELECT pg_catalog.setval('pit.tutorados_id_seq', 11, true);
SELECT pg_catalog.setval('pit.tutores_id_seq', 3, true);
SELECT pg_catalog.setval('pit.usuarios_id_seq', 15, true);
ALTER TABLE ONLY pit.asignaciones_tutoria
    ADD CONSTRAINT asignaciones_tutoria_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.avisos
    ADD CONSTRAINT avisos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.canalizaciones
    ADD CONSTRAINT canalizaciones_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.citas_tutorias
    ADD CONSTRAINT citas_tutorias_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.evaluaciones_alumno
    ADD CONSTRAINT evaluaciones_alumno_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.evaluaciones_tutor
    ADD CONSTRAINT evaluaciones_tutor_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.fichas_identificacion_historial
    ADD CONSTRAINT fichas_identificacion_historial_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.fichas_identificacion
    ADD CONSTRAINT fichas_identificacion_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.fichas_identificacion
    ADD CONSTRAINT fichas_identificacion_tutorado_id_key UNIQUE (tutorado_id);
ALTER TABLE ONLY pit.perfiles_tutorado
    ADD CONSTRAINT perfiles_tutorado_pkey PRIMARY KEY (tutorado_id);
ALTER TABLE ONLY pit.reportes_pit
    ADD CONSTRAINT reportes_pit_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.tutor_horarios
    ADD CONSTRAINT tutor_horarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.tutorados
    ADD CONSTRAINT tutorados_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.tutorados
    ADD CONSTRAINT tutorados_usuario_id_key UNIQUE (usuario_id);
ALTER TABLE ONLY pit.tutores
    ADD CONSTRAINT tutores_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.tutores
    ADD CONSTRAINT tutores_usuario_id_key UNIQUE (usuario_id);
ALTER TABLE ONLY pit.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pit.evaluaciones_tutor
    ADD CONSTRAINT ux_eval_tutor_periodo UNIQUE (tutor_id, periodo);
ALTER TABLE ONLY pit.evaluaciones_alumno
    ADD CONSTRAINT ux_evalal_alumno_periodo UNIQUE (tutorado_id, periodo);
ALTER TABLE ONLY pit.tutor_horarios
    ADD CONSTRAINT ux_horario_bloque UNIQUE (tutor_id, dia_semana, hora_inicio);
ALTER TABLE ONLY pit.reportes_pit
    ADD CONSTRAINT ux_reportes_unico UNIQUE (tutorado_id, periodo, tipo_formato);
CREATE INDEX ix_asig_tutor_periodo ON pit.asignaciones_tutoria USING btree (tutor_id, periodo_escolar);
CREATE INDEX ix_avisos_estado ON pit.avisos USING btree (estado, fecha_publicacion DESC);
CREATE INDEX ix_canal_estatus ON pit.canalizaciones USING btree (estatus_canalizacion, area_destino);
CREATE INDEX ix_citas_tutor_fecha ON pit.citas_tutorias USING btree (tutor_id, fecha_hora);
CREATE INDEX ix_citas_tutorado_fecha ON pit.citas_tutorias USING btree (tutorado_id, fecha_hora);
CREATE INDEX ix_eval_periodo ON pit.evaluaciones_tutor USING btree (periodo);
CREATE INDEX ix_evalal_tutor_periodo ON pit.evaluaciones_alumno USING btree (tutor_id, periodo);
CREATE INDEX ix_ficha_estado ON pit.fichas_identificacion USING btree (estado);
CREATE INDEX ix_ficha_hist_tutorado ON pit.fichas_identificacion_historial USING btree (tutorado_id, fecha DESC);
CREATE INDEX ix_horarios_tutor ON pit.tutor_horarios USING btree (tutor_id, dia_semana);
CREATE INDEX ix_tutorados_riesgo ON pit.tutorados USING btree (nivel_riesgo);
CREATE INDEX ix_usuarios_rol_estado ON pit.usuarios USING btree (rol, estado);
CREATE UNIQUE INDEX ux_asig_tutorado_periodo_activa ON pit.asignaciones_tutoria USING btree (tutorado_id, periodo_escolar) WHERE (estatus_asignacion = 'Activa'::pit.estatus_asignacion);
CREATE UNIQUE INDEX ux_canal_abierta_por_area ON pit.canalizaciones USING btree (tutorado_id, area_destino) WHERE (estatus_canalizacion = ANY (ARRAY['Pendiente'::pit.estatus_canalizacion, 'En Proceso'::pit.estatus_canalizacion, 'Aceptado'::pit.estatus_canalizacion]));
CREATE UNIQUE INDEX ux_citas_tutor_horario_vigente ON pit.citas_tutorias USING btree (tutor_id, fecha_hora) WHERE (estatus = ANY (ARRAY['Pendiente'::pit.estatus_cita, 'Confirmada'::pit.estatus_cita]));
CREATE UNIQUE INDEX ux_usuarios_control ON pit.usuarios USING btree (no_control_o_rfc);
CREATE UNIQUE INDEX ux_usuarios_correo ON pit.usuarios USING btree (lower((correo_institucional)::text));
CREATE TRIGGER trg_asig_cupo BEFORE INSERT OR UPDATE OF tutor_id, estatus_asignacion ON pit.asignaciones_tutoria FOR EACH ROW EXECUTE FUNCTION pit.fn_validar_cupo_tutor();
CREATE TRIGGER trg_avisos_updated BEFORE UPDATE ON pit.avisos FOR EACH ROW EXECUTE FUNCTION pit.fn_set_updated_at();
CREATE TRIGGER trg_canal_updated BEFORE UPDATE ON pit.canalizaciones FOR EACH ROW EXECUTE FUNCTION pit.fn_set_updated_at();
CREATE TRIGGER trg_citas_updated BEFORE UPDATE ON pit.citas_tutorias FOR EACH ROW EXECUTE FUNCTION pit.fn_set_updated_at();
CREATE TRIGGER trg_eval_updated BEFORE UPDATE ON pit.evaluaciones_tutor FOR EACH ROW EXECUTE FUNCTION pit.fn_set_updated_at();
CREATE TRIGGER trg_evalal_updated BEFORE UPDATE ON pit.evaluaciones_alumno FOR EACH ROW EXECUTE FUNCTION pit.fn_set_updated_at();
CREATE TRIGGER trg_ficha_updated BEFORE UPDATE ON pit.fichas_identificacion FOR EACH ROW EXECUTE FUNCTION pit.fn_set_updated_at();
CREATE TRIGGER trg_perfil_tutorado_updated BEFORE UPDATE ON pit.perfiles_tutorado FOR EACH ROW EXECUTE FUNCTION pit.fn_set_updated_at();
CREATE TRIGGER trg_tutorados_riesgo BEFORE INSERT OR UPDATE OF materias_reprobadas, avance_reticular_pct, semestre, estatus_academico ON pit.tutorados FOR EACH ROW EXECUTE FUNCTION pit.fn_calcular_nivel_riesgo();
CREATE TRIGGER trg_tutorados_rol BEFORE INSERT OR UPDATE OF usuario_id ON pit.tutorados FOR EACH ROW EXECUTE FUNCTION pit.fn_validar_roles();
CREATE TRIGGER trg_tutorados_updated BEFORE UPDATE ON pit.tutorados FOR EACH ROW EXECUTE FUNCTION pit.fn_set_updated_at();
CREATE TRIGGER trg_tutores_rol BEFORE INSERT OR UPDATE OF usuario_id ON pit.tutores FOR EACH ROW EXECUTE FUNCTION pit.fn_validar_roles();
CREATE TRIGGER trg_tutores_updated BEFORE UPDATE ON pit.tutores FOR EACH ROW EXECUTE FUNCTION pit.fn_set_updated_at();
CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON pit.usuarios FOR EACH ROW EXECUTE FUNCTION pit.fn_set_updated_at();
ALTER TABLE ONLY pit.asignaciones_tutoria
    ADD CONSTRAINT asignaciones_tutoria_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES pit.tutores(id) ON DELETE RESTRICT;
ALTER TABLE ONLY pit.asignaciones_tutoria
    ADD CONSTRAINT asignaciones_tutoria_tutorado_id_fkey FOREIGN KEY (tutorado_id) REFERENCES pit.tutorados(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.avisos
    ADD CONSTRAINT avisos_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES pit.usuarios(id) ON DELETE SET NULL;
ALTER TABLE ONLY pit.canalizaciones
    ADD CONSTRAINT canalizaciones_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES pit.tutores(id) ON DELETE RESTRICT;
ALTER TABLE ONLY pit.canalizaciones
    ADD CONSTRAINT canalizaciones_tutorado_id_fkey FOREIGN KEY (tutorado_id) REFERENCES pit.tutorados(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.citas_tutorias
    ADD CONSTRAINT citas_tutorias_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES pit.usuarios(id) ON DELETE SET NULL;
ALTER TABLE ONLY pit.citas_tutorias
    ADD CONSTRAINT citas_tutorias_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES pit.tutores(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.citas_tutorias
    ADD CONSTRAINT citas_tutorias_tutorado_id_fkey FOREIGN KEY (tutorado_id) REFERENCES pit.tutorados(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.evaluaciones_alumno
    ADD CONSTRAINT evaluaciones_alumno_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES pit.tutores(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.evaluaciones_alumno
    ADD CONSTRAINT evaluaciones_alumno_tutorado_id_fkey FOREIGN KEY (tutorado_id) REFERENCES pit.tutorados(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.evaluaciones_tutor
    ADD CONSTRAINT evaluaciones_tutor_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES pit.tutores(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.fichas_identificacion
    ADD CONSTRAINT fichas_identificacion_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES pit.usuarios(id) ON DELETE SET NULL;
ALTER TABLE ONLY pit.fichas_identificacion_historial
    ADD CONSTRAINT fichas_identificacion_historial_tutorado_id_fkey FOREIGN KEY (tutorado_id) REFERENCES pit.tutorados(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.fichas_identificacion_historial
    ADD CONSTRAINT fichas_identificacion_historial_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pit.usuarios(id) ON DELETE SET NULL;
ALTER TABLE ONLY pit.fichas_identificacion
    ADD CONSTRAINT fichas_identificacion_revisada_por_fkey FOREIGN KEY (revisada_por) REFERENCES pit.usuarios(id) ON DELETE SET NULL;
ALTER TABLE ONLY pit.fichas_identificacion
    ADD CONSTRAINT fichas_identificacion_tutorado_id_fkey FOREIGN KEY (tutorado_id) REFERENCES pit.tutorados(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.perfiles_tutorado
    ADD CONSTRAINT perfiles_tutorado_tutorado_id_fkey FOREIGN KEY (tutorado_id) REFERENCES pit.tutorados(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.reportes_pit
    ADD CONSTRAINT reportes_pit_tutorado_id_fkey FOREIGN KEY (tutorado_id) REFERENCES pit.tutorados(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.tutor_horarios
    ADD CONSTRAINT tutor_horarios_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES pit.tutores(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.tutorados
    ADD CONSTRAINT tutorados_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pit.usuarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY pit.tutores
    ADD CONSTRAINT tutores_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pit.usuarios(id) ON DELETE CASCADE;
