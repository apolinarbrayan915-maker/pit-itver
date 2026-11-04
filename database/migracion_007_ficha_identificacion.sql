-- =============================================================================
--  MIGRACIÓN 007 · Ficha de Identificación del Tutorado (Anexo 6, 2026)
--  - El tutorado la llena en línea (Formatos PIT) y puede actualizarla.
--  - La Coordinación de Tutorías la consulta, corrige, revisa o elimina.
--  - Cada cambio queda en el historial (quién, cuándo y qué campos cambió).
--  datos: objeto JSON con los campos del Anexo 6 (ver server/src/utils/fichaIdentificacion.js)
--  No borra datos. Es seguro ejecutarla más de una vez.
--
--  Ejecutar (PowerShell, desde la carpeta pit-itver):
--      $env:PGCLIENTENCODING="UTF8"
--      psql -U pit_app -d pit_itver -h localhost -f database/migracion_007_ficha_identificacion.sql
-- =============================================================================
SET client_min_messages = warning;

BEGIN;

CREATE TABLE IF NOT EXISTS fichas_identificacion (
    id                  SERIAL PRIMARY KEY,
    tutorado_id         INTEGER     NOT NULL UNIQUE REFERENCES tutorados (id) ON DELETE CASCADE,
    datos               JSONB       NOT NULL,
    estado              VARCHAR(20) NOT NULL DEFAULT 'Enviada',
    observaciones       TEXT,                       -- nota de la coordinación para el tutorado
    actualizado_por     INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
    actualizado_por_rol rol_usuario,
    revisada_por        INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
    fecha_revision      TIMESTAMPTZ,
    fecha_envio         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_ficha_objeto CHECK (jsonb_typeof(datos) = 'object'),
    CONSTRAINT chk_ficha_estado CHECK (estado IN ('Enviada', 'Revisada', 'Requiere corrección')),
    CONSTRAINT chk_ficha_obs    CHECK (observaciones IS NULL OR length(observaciones) <= 1000)
);

CREATE INDEX IF NOT EXISTS ix_ficha_estado ON fichas_identificacion (estado);

DROP TRIGGER IF EXISTS trg_ficha_updated ON fichas_identificacion;
CREATE TRIGGER trg_ficha_updated BEFORE UPDATE ON fichas_identificacion
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE IF NOT EXISTS fichas_identificacion_historial (
    id          SERIAL PRIMARY KEY,
    tutorado_id INTEGER     NOT NULL REFERENCES tutorados (id) ON DELETE CASCADE,
    usuario_id  INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
    rol         rol_usuario,
    accion      VARCHAR(30) NOT NULL,   -- Envío, Actualización, Corrección, Revisión, Solicitud de corrección, Eliminación
    cambios     JSONB,                  -- { campo: { antes, despues } }
    nota        TEXT,
    fecha       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ficha_hist_tutorado ON fichas_identificacion_historial (tutorado_id, fecha DESC);

COMMENT ON TABLE fichas_identificacion IS
  'Anexo 6 · Ficha de Identificación del tutorado. Confidencial: la llena el tutorado y la administra la Coordinación de Tutorías.';

-- -----------------------------------------------------------------------------
-- Fichas de ejemplo: una enviada, una revisada y una que requiere corrección.
-- El resto de los tutorados queda pendiente para probar el formulario.
-- -----------------------------------------------------------------------------
INSERT INTO fichas_identificacion (tutorado_id, datos, estado, observaciones, actualizado_por,
                                   actualizado_por_rol, fecha_envio, revisada_por, fecha_revision)
SELECT t.id, v.datos::jsonb, v.estado, v.obs, u.id, 'alumno', now() - v.hace,
       CASE WHEN v.estado <> 'Enviada' THEN c.id END,
       CASE WHEN v.estado <> 'Enviada' THEN now() - v.hace + INTERVAL '1 day' END
  FROM (VALUES
    ('25020204', 'Revisada', NULL, INTERVAL '20 days',
     '{"fecha":"2026-09-01","carrera":"Ingeniería en Sistemas Computacionales","semestre":4,
       "apellido_paterno":"Martínez","apellido_materno":"López","nombres":"Andrea",
       "sexo":"Mujer","tel_domicilio":"2299345678","celular1":"2291234567","celular2":"",
       "correo":"andrea.ml@gmail.com","fecha_nacimiento":"2006-04-12","lugar_nacimiento":"Boca del Río, Ver.",
       "estado_civil":"Soltero(a)","estado_civil_otro":"","num_hijos":0,
       "domicilio":"Av. Díaz Mirón 1450, Col. Centro, Veracruz, Ver., C.P. 91700",
       "escolaridad":"Bachillerato técnico","institucion_procedencia":"CBTIS 79",
       "becado":"Sí","tipos_beca":["Gobierno federal"],"beca_institucion":"Beca Benito Juárez",
       "vivira_con":"Con mi familia","trabaja":"No","empresa":"","horario_trabajo":"",
       "escolaridad_padre":"Licenciatura","escolaridad_madre":"Preparatoria",
       "padre_vive":"Vive","madre_vive":"Vive",
       "trabajo_padre":"Puerto de Veracruz (API)","trabajo_madre":"Hogar",
       "emergencia_nombre":"Rosa López Hernández","emergencia_telefono":"2297654321"}'),
    ('25020345', 'Requiere corrección', 'El teléfono de emergencia tiene 9 dígitos; corrígelo por favor.', INTERVAL '12 days',
     '{"fecha":"2026-09-05","carrera":"Ingeniería en Sistemas Computacionales","semestre":4,
       "apellido_paterno":"Pérez","apellido_materno":"Sánchez","nombres":"Juan",
       "sexo":"Hombre","tel_domicilio":"","celular1":"2293456789","celular2":"",
       "correo":"juanps@outlook.com","fecha_nacimiento":"2005-11-30","lugar_nacimiento":"Xalapa, Ver.",
       "estado_civil":"Soltero(a)","estado_civil_otro":"","num_hijos":0,
       "domicilio":"Calle Arista 320 int. 4, Col. Formando Hogar, Veracruz, Ver.",
       "escolaridad":"Preparatoria","institucion_procedencia":"Colegio Preparatorio de Xalapa",
       "becado":"No","tipos_beca":[],"beca_institucion":"",
       "vivira_con":"Con otros estudiantes","trabaja":"Sí","empresa":"Cafetería La Parroquia","horario_trabajo":"Sáb y Dom 8:00–16:00",
       "escolaridad_padre":"Secundaria","escolaridad_madre":"Técnico",
       "padre_vive":"Finado","madre_vive":"Vive",
       "trabajo_padre":"","trabajo_madre":"Hospital Regional de Xalapa",
       "emergencia_nombre":"María Sánchez Ortiz","emergencia_telefono":"228123456"}'),
    ('26020133', 'Enviada', NULL, INTERVAL '2 days',
     '{"fecha":"2026-10-15","carrera":"Ingeniería en Sistemas Computacionales","semestre":2,
       "apellido_paterno":"Torres","apellido_materno":"Méndez","nombres":"Valeria",
       "sexo":"Mujer","tel_domicilio":"","celular1":"2295551122","celular2":"2295553344",
       "correo":"vale.torres@gmail.com","fecha_nacimiento":"2008-02-20","lugar_nacimiento":"Veracruz, Ver.",
       "estado_civil":"Soltero(a)","estado_civil_otro":"","num_hijos":0,
       "domicilio":"Fracc. Costa Verde, Calle Gaviota 18, Boca del Río, Ver.",
       "escolaridad":"Preparatoria","institucion_procedencia":"Instituto Veracruzano",
       "becado":"Sí","tipos_beca":["Gobierno estatal","Esfuerzos de bachillerato"],"beca_institucion":"Instituto Veracruzano",
       "vivira_con":"Con mi familia","trabaja":"No","empresa":"","horario_trabajo":"",
       "escolaridad_padre":"Posgrado","escolaridad_madre":"Licenciatura",
       "padre_vive":"Vive","madre_vive":"Vive",
       "trabajo_padre":"Universidad Veracruzana","trabajo_madre":"Despacho contable propio",
       "emergencia_nombre":"Jorge Torres Ruiz","emergencia_telefono":"2299887766"}')
  ) AS v(ident, estado, obs, hace, datos)
  JOIN usuarios u  ON u.no_control_o_rfc = v.ident
  JOIN tutorados t ON t.usuario_id = u.id
  LEFT JOIN LATERAL (SELECT id FROM usuarios WHERE rol = 'coordinador' ORDER BY id LIMIT 1) c ON true
ON CONFLICT (tutorado_id) DO NOTHING;

-- Historial inicial de las fichas de ejemplo (solo si aún no tienen historial)
INSERT INTO fichas_identificacion_historial (tutorado_id, usuario_id, rol, accion, fecha)
SELECT f.tutorado_id, f.actualizado_por, 'alumno', 'Envío', f.fecha_envio
  FROM fichas_identificacion f
 WHERE NOT EXISTS (SELECT 1 FROM fichas_identificacion_historial h WHERE h.tutorado_id = f.tutorado_id);

INSERT INTO fichas_identificacion_historial (tutorado_id, usuario_id, rol, accion, nota, fecha)
SELECT f.tutorado_id, f.revisada_por, 'coordinador',
       CASE f.estado WHEN 'Revisada' THEN 'Revisión' ELSE 'Solicitud de corrección' END,
       f.observaciones, f.fecha_revision
  FROM fichas_identificacion f
 WHERE f.estado <> 'Enviada' AND f.revisada_por IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM fichas_identificacion_historial h
                    WHERE h.tutorado_id = f.tutorado_id AND h.rol = 'coordinador');

COMMIT;

SELECT estado, count(*) AS fichas FROM fichas_identificacion GROUP BY estado ORDER BY estado;
