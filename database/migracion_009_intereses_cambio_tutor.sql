-- Portal del tutorado:
--  1) Intereses del tutorado para recomendarle tutores.
--  2) Solicitudes de cambio de tutor (solo al inicio del semestre, las aprueba la coordinación).
--  3) Evaluación tutoral: una por cada tutor que atendió al tutorado en el periodo.

ALTER TABLE perfiles_tutorado ADD COLUMN IF NOT EXISTS intereses text[] NOT NULL DEFAULT '{}';
ALTER TABLE perfiles_tutorado DROP CONSTRAINT IF EXISTS chk_perfil_intereses;
ALTER TABLE perfiles_tutorado ADD CONSTRAINT chk_perfil_intereses CHECK (cardinality(intereses) <= 8);
COMMENT ON COLUMN perfiles_tutorado.intereses IS 'Áreas en las que el tutorado necesita apoyo o le interesan; sirven para recomendarle tutores.';

CREATE TABLE IF NOT EXISTS solicitudes_cambio_tutor (
    id serial PRIMARY KEY,
    tutorado_id integer NOT NULL REFERENCES tutorados(id) ON DELETE CASCADE,
    tutor_actual_id integer NOT NULL REFERENCES tutores(id) ON DELETE CASCADE,
    tutor_nuevo_id integer NOT NULL REFERENCES tutores(id) ON DELETE CASCADE,
    periodo character varying(6) NOT NULL,
    motivo text NOT NULL CHECK (length(motivo) BETWEEN 10 AND 600),
    estatus character varying(12) NOT NULL DEFAULT 'Pendiente'
        CHECK (estatus IN ('Pendiente', 'Aprobada', 'Rechazada', 'Cancelada')),
    respuesta text CHECK (respuesta IS NULL OR length(respuesta) <= 600),
    creada_en timestamptz NOT NULL DEFAULT now(),
    resuelta_en timestamptz,
    resuelta_por integer REFERENCES usuarios(id) ON DELETE SET NULL,
    CHECK (tutor_actual_id <> tutor_nuevo_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_solcambio_pendiente ON solicitudes_cambio_tutor (tutorado_id) WHERE estatus = 'Pendiente';
COMMENT ON TABLE solicitudes_cambio_tutor IS 'Cambio de tutor pedido por el tutorado; solo en las primeras semanas del semestre y con aprobación de la coordinación.';

ALTER TABLE evaluaciones_alumno DROP CONSTRAINT IF EXISTS ux_evalal_alumno_periodo;
ALTER TABLE evaluaciones_alumno DROP CONSTRAINT IF EXISTS ux_evalal_alumno_tutor_periodo;
ALTER TABLE evaluaciones_alumno ADD CONSTRAINT ux_evalal_alumno_tutor_periodo UNIQUE (tutorado_id, tutor_id, periodo);
