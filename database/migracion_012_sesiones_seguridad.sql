-- 010: Sesiones del lado del servidor y bloqueo por intentos fallidos
-- Cerrar sesión invalida el token de verdad, y una sesión sin uso caduca sola.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos smallint NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta timestamptz;
COMMENT ON COLUMN usuarios.bloqueado_hasta IS 'Tras 5 contraseñas incorrectas seguidas la cuenta se bloquea 15 minutos.';

CREATE TABLE IF NOT EXISTS sesiones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creada timestamptz NOT NULL DEFAULT now(),
    ultimo_uso timestamptz NOT NULL DEFAULT now(),
    cerrada timestamptz,
    ip varchar(64),
    agente varchar(200)
);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones (usuario_id);
COMMENT ON TABLE sesiones IS 'Una fila por inicio de sesión. El token solo vale mientras su sesión esté abierta y en uso.';
