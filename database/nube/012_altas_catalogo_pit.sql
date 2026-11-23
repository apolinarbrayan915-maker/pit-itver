SET search_path = pit;

CREATE TABLE IF NOT EXISTS altas_catalogo_pit (
  perfil_id text PRIMARY KEY,
  nombre text NOT NULL,
  correo text UNIQUE NOT NULL,
  cubiculo varchar(40) NOT NULL,
  cupo smallint NOT NULL CHECK (cupo BETWEEN 1 AND 60),
  dia_1 smallint NOT NULL CHECK (dia_1 BETWEEN 1 AND 5),
  inicio_1 time NOT NULL,
  fin_1 time NOT NULL CHECK (fin_1 > inicio_1),
  dia_2 smallint NOT NULL CHECK (dia_2 BETWEEN 1 AND 5 AND dia_2 <> dia_1),
  inicio_2 time NOT NULL,
  fin_2 time NOT NULL CHECK (fin_2 > inicio_2)
);

INSERT INTO altas_catalogo_pit (perfil_id, nombre, correo, cubiculo, cupo, dia_1, inicio_1, fin_1, dia_2, inicio_2, fin_2)
VALUES
('mp-23319', 'Abelardo Rodríguez León', 'pit.evaluacion.mp-23319@veracruz.tecnm.mx', 'E-01', 4, 1, '09:00', '10:00', 3, '12:00', '13:00'),
('mp-63244', 'Agustin Colina Sanchez', 'pit.evaluacion.mp-63244@veracruz.tecnm.mx', 'E-02', 5, 2, '09:00', '10:00', 4, '13:00', '14:00'),
('mp-170362', 'Alberth Hammel Dammel', 'pit.evaluacion.mp-170362@veracruz.tecnm.mx', 'E-03', 6, 3, '09:00', '10:00', 5, '15:00', '16:00'),
('mp-169796', 'Alexander Fausting', 'pit.evaluacion.mp-169796@veracruz.tecnm.mx', 'E-04', 7, 4, '09:00', '10:00', 1, '16:00', '17:00'),
('mp-63162', 'Amanda Caracas Capetillo', 'pit.evaluacion.mp-63162@veracruz.tecnm.mx', 'E-05', 8, 5, '09:00', '10:00', 2, '09:00', '10:00'),
('mp-172286', 'Arturo Rendón', 'pit.evaluacion.mp-172286@veracruz.tecnm.mx', 'E-06', 4, 1, '10:00', '11:00', 3, '10:00', '11:00'),
('mp-181170', 'Berenice Lagunes Padilla', 'pit.evaluacion.mp-181170@veracruz.tecnm.mx', 'E-07', 5, 2, '10:00', '11:00', 4, '11:00', '12:00'),
('mp-66356', 'Carlos Lagunes', 'pit.evaluacion.mp-66356@veracruz.tecnm.mx', 'E-08', 6, 3, '10:00', '11:00', 5, '12:00', '13:00'),
('mp-59309', 'Carlos Ley Borraz', 'pit.evaluacion.mp-59309@veracruz.tecnm.mx', 'E-09', 7, 4, '10:00', '11:00', 1, '13:00', '14:00'),
('mp-66355', 'Carlos Olmos', 'pit.evaluacion.mp-66355@veracruz.tecnm.mx', 'E-10', 8, 5, '10:00', '11:00', 2, '15:00', '16:00'),
('mp-44715', 'Claudio Yepez Sosa', 'pit.evaluacion.mp-44715@veracruz.tecnm.mx', 'E-11', 4, 1, '11:00', '12:00', 3, '16:00', '17:00'),
('mp-55388', 'Daniela Hernandez Barrios', 'pit.evaluacion.mp-55388@veracruz.tecnm.mx', 'E-12', 5, 2, '11:00', '12:00', 4, '09:00', '10:00'),
('mp-169325', 'David Leon', 'pit.evaluacion.mp-169325@veracruz.tecnm.mx', 'E-13', 6, 3, '11:00', '12:00', 5, '10:00', '11:00'),
('mp-14748', 'Delio Coss Camilo', 'pit.evaluacion.mp-14748@veracruz.tecnm.mx', 'E-14', 7, 4, '11:00', '12:00', 1, '11:00', '12:00'),
('mp-16505', 'Eduardo Trujillo Jiménez', 'pit.evaluacion.mp-16505@veracruz.tecnm.mx', 'E-15', 8, 5, '11:00', '12:00', 2, '12:00', '13:00'),
('mp-92553', 'Efrén Mendoza Chaparro', 'pit.evaluacion.mp-92553@veracruz.tecnm.mx', 'E-16', 4, 1, '12:00', '13:00', 3, '13:00', '14:00'),
('mp-17475', 'Elisa Cano', 'pit.evaluacion.mp-17475@veracruz.tecnm.mx', 'E-17', 5, 2, '12:00', '13:00', 4, '15:00', '16:00'),
('mp-135869', 'Enrique Soto Andrade', 'pit.evaluacion.mp-135869@veracruz.tecnm.mx', 'E-18', 6, 3, '12:00', '13:00', 5, '16:00', '17:00'),
('mp-181193', 'Erick López Sánchez', 'pit.evaluacion.mp-181193@veracruz.tecnm.mx', 'E-19', 7, 4, '12:00', '13:00', 1, '09:00', '10:00'),
('mp-16319', 'Esteban Mendoza', 'pit.evaluacion.mp-16319@veracruz.tecnm.mx', 'E-20', 8, 5, '12:00', '13:00', 2, '10:00', '11:00'),
('mp-14749', 'Evaristo Pacheco', 'pit.evaluacion.mp-14749@veracruz.tecnm.mx', 'E-21', 4, 1, '13:00', '14:00', 3, '11:00', '12:00'),
('mp-16316', 'Ezequiel Piña Ortiz', 'pit.evaluacion.mp-16316@veracruz.tecnm.mx', 'E-22', 5, 2, '13:00', '14:00', 4, '12:00', '13:00'),
('mp-45487', 'Felipe Verdalet Guzman', 'pit.evaluacion.mp-45487@veracruz.tecnm.mx', 'E-23', 6, 3, '13:00', '14:00', 5, '13:00', '14:00'),
('mp-142898', 'Gabriel Antonio Sanchez Ortiz', 'pit.evaluacion.mp-142898@veracruz.tecnm.mx', 'E-24', 7, 4, '13:00', '14:00', 1, '15:00', '16:00'),
('mp-26308', 'Gabriel Cedeño Collins', 'pit.evaluacion.mp-26308@veracruz.tecnm.mx', 'E-25', 8, 5, '13:00', '14:00', 2, '16:00', '17:00'),
('mp-16504', 'Gaby Clavel', 'pit.evaluacion.mp-16504@veracruz.tecnm.mx', 'E-26', 4, 1, '15:00', '16:00', 3, '09:00', '10:00'),
('mp-16622', 'Gerardo Ortiz Quiroz', 'pit.evaluacion.mp-16622@veracruz.tecnm.mx', 'E-27', 5, 2, '15:00', '16:00', 4, '10:00', '11:00'),
('mp-16540', 'Héctor Andrade Gómez', 'pit.evaluacion.mp-16540@veracruz.tecnm.mx', 'E-28', 6, 3, '15:00', '16:00', 5, '11:00', '12:00'),
('mp-44769', 'Héctor Pérez Ortíz', 'pit.evaluacion.mp-44769@veracruz.tecnm.mx', 'E-29', 7, 4, '15:00', '16:00', 1, '12:00', '13:00'),
('mp-112349', 'J. Manuel Miranda Villagrán', 'pit.evaluacion.mp-112349@veracruz.tecnm.mx', 'E-30', 8, 5, '15:00', '16:00', 2, '13:00', '14:00'),
('mp-106017', 'Jaír Alayon', 'pit.evaluacion.mp-106017@veracruz.tecnm.mx', 'E-31', 4, 1, '16:00', '17:00', 3, '15:00', '16:00'),
('mp-18506', 'Jesus Cruzado', 'pit.evaluacion.mp-18506@veracruz.tecnm.mx', 'E-32', 5, 2, '16:00', '17:00', 4, '16:00', '17:00'),
('mp-29302', 'Jesus Fabian Rosales Vega', 'pit.evaluacion.mp-29302@veracruz.tecnm.mx', 'E-33', 6, 3, '16:00', '17:00', 5, '09:00', '10:00'),
('mp-108164', 'Jesus Roque Martinez', 'pit.evaluacion.mp-108164@veracruz.tecnm.mx', 'E-34', 7, 4, '16:00', '17:00', 1, '10:00', '11:00'),
('mp-40244', 'Jorge Estudillo Ramirez', 'pit.evaluacion.mp-40244@veracruz.tecnm.mx', 'E-35', 8, 5, '16:00', '17:00', 2, '11:00', '12:00'),
('mp-107452', 'Jose Guadalupe Garcia Ramirez', 'pit.evaluacion.mp-107452@veracruz.tecnm.mx', 'E-36', 4, 1, '09:00', '10:00', 3, '12:00', '13:00'),
('mp-84176', 'Jose Ramon Beltran Guzman', 'pit.evaluacion.mp-84176@veracruz.tecnm.mx', 'E-37', 5, 2, '09:00', '10:00', 4, '13:00', '14:00'),
('mp-167809', 'Juan Manuel Bucio Ballado', 'pit.evaluacion.mp-167809@veracruz.tecnm.mx', 'E-38', 6, 3, '09:00', '10:00', 5, '15:00', '16:00'),
('mp-131082', 'Karina Gómez Cantarell', 'pit.evaluacion.mp-131082@veracruz.tecnm.mx', 'E-39', 7, 4, '09:00', '10:00', 1, '16:00', '17:00'),
('mp-16623', 'Leonardo Lezama', 'pit.evaluacion.mp-16623@veracruz.tecnm.mx', 'E-40', 8, 5, '09:00', '10:00', 2, '09:00', '10:00'),
('mp-109622', 'Liliana Rangel Renteria', 'pit.evaluacion.mp-109622@veracruz.tecnm.mx', 'E-41', 4, 1, '10:00', '11:00', 3, '10:00', '11:00'),
('mp-16539', 'Lizbeth Sánchez Ferrer', 'pit.evaluacion.mp-16539@veracruz.tecnm.mx', 'E-42', 5, 2, '10:00', '11:00', 4, '11:00', '12:00'),
('mp-183695', 'Luis Antonio Cocoletzi', 'pit.evaluacion.mp-183695@veracruz.tecnm.mx', 'E-43', 6, 3, '10:00', '11:00', 5, '12:00', '13:00'),
('mp-16842', 'Luis Bernardo Ballesteros Barradas', 'pit.evaluacion.mp-16842@veracruz.tecnm.mx', 'E-44', 7, 4, '10:00', '11:00', 1, '13:00', '14:00'),
('mp-16678', 'Luis Reyes Rivera', 'pit.evaluacion.mp-16678@veracruz.tecnm.mx', 'E-45', 8, 5, '10:00', '11:00', 2, '15:00', '16:00'),
('mp-74707', 'Luis Rivera Lozano', 'pit.evaluacion.mp-74707@veracruz.tecnm.mx', 'E-46', 4, 1, '11:00', '12:00', 3, '16:00', '17:00'),
('mp-16529', 'Marco Romo Medina', 'pit.evaluacion.mp-16529@veracruz.tecnm.mx', 'E-47', 5, 2, '11:00', '12:00', 4, '09:00', '10:00'),
('mp-16545', 'Margarita Ostos', 'pit.evaluacion.mp-16545@veracruz.tecnm.mx', 'E-48', 6, 3, '11:00', '12:00', 5, '10:00', '11:00'),
('mp-19867', 'María Dolores Castro Valdés', 'pit.evaluacion.mp-19867@veracruz.tecnm.mx', 'E-49', 7, 4, '11:00', '12:00', 1, '11:00', '12:00'),
('mp-16630', 'Marta Martinez', 'pit.evaluacion.mp-16630@veracruz.tecnm.mx', 'E-50', 8, 5, '11:00', '12:00', 2, '12:00', '13:00'),
('mp-16506', 'Martinez San German', 'pit.evaluacion.mp-16506@veracruz.tecnm.mx', 'E-51', 4, 1, '12:00', '13:00', 3, '13:00', '14:00'),
('mp-93933', 'Miguel Ángel Pérez Cabada', 'pit.evaluacion.mp-93933@veracruz.tecnm.mx', 'E-52', 5, 2, '12:00', '13:00', 4, '15:00', '16:00'),
('mp-185770', 'Monserrat Ferrari', 'pit.evaluacion.mp-185770@veracruz.tecnm.mx', 'E-53', 6, 3, '12:00', '13:00', 5, '16:00', '17:00'),
('mp-16317', 'Ofelia Giraldi', 'pit.evaluacion.mp-16317@veracruz.tecnm.mx', 'E-54', 7, 4, '12:00', '13:00', 1, '09:00', '10:00'),
('mp-16291', 'Patricia Horta Rosado', 'pit.evaluacion.mp-16291@veracruz.tecnm.mx', 'E-55', 8, 5, '12:00', '13:00', 2, '10:00', '11:00'),
('mp-16686', 'Rafael Córdoba del Valle', 'pit.evaluacion.mp-16686@veracruz.tecnm.mx', 'E-56', 4, 1, '13:00', '14:00', 3, '11:00', '12:00'),
('mp-16538', 'Rafael Rivera', 'pit.evaluacion.mp-16538@veracruz.tecnm.mx', 'E-57', 5, 2, '13:00', '14:00', 4, '12:00', '13:00'),
('mp-109923', 'Raúl Hector Trujillo Jimenez', 'pit.evaluacion.mp-109923@veracruz.tecnm.mx', 'E-58', 6, 3, '13:00', '14:00', 5, '13:00', '14:00'),
('mp-92038', 'Reynaldo Guitiérrez Avendaño', 'pit.evaluacion.mp-92038@veracruz.tecnm.mx', 'E-59', 7, 4, '13:00', '14:00', 1, '15:00', '16:00'),
('mp-16677', 'Ricardo Rodríguez de la Lanza', 'pit.evaluacion.mp-16677@veracruz.tecnm.mx', 'E-60', 8, 5, '13:00', '14:00', 2, '16:00', '17:00'),
('mp-21402', 'Rocio Gonzalez Contreras', 'pit.evaluacion.mp-21402@veracruz.tecnm.mx', 'E-61', 4, 1, '15:00', '16:00', 3, '09:00', '10:00'),
('mp-43176', 'Rodolfo Senties', 'pit.evaluacion.mp-43176@veracruz.tecnm.mx', 'E-62', 5, 2, '15:00', '16:00', 4, '10:00', '11:00'),
('mp-16507', 'Senen Juarez Tinoco', 'pit.evaluacion.mp-16507@veracruz.tecnm.mx', 'E-63', 6, 3, '15:00', '16:00', 5, '11:00', '12:00'),
('mp-189176', 'Sergio Rios', 'pit.evaluacion.mp-189176@veracruz.tecnm.mx', 'E-64', 7, 4, '15:00', '16:00', 1, '12:00', '13:00'),
('mp-79156', 'Sidney René Toledo Martínez', 'pit.evaluacion.mp-79156@veracruz.tecnm.mx', 'E-65', 8, 5, '15:00', '16:00', 2, '13:00', '14:00'),
('mp-17096', 'Victor Cruz', 'pit.evaluacion.mp-17096@veracruz.tecnm.mx', 'E-66', 4, 1, '16:00', '17:00', 3, '15:00', '16:00'),
('mp-180044', 'Violeta del Rocío Hernández Campos', 'pit.evaluacion.mp-180044@veracruz.tecnm.mx', 'E-67', 5, 2, '16:00', '17:00', 4, '16:00', '17:00')
ON CONFLICT (perfil_id) DO NOTHING;

-- Requiere correo existente, rol docente activo y coincidencia del nombre completo.
CREATE OR REPLACE FUNCTION alta_catalogo_identidad(valor text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT string_agg(token, ' ' ORDER BY token)
  FROM regexp_split_to_table(
    translate(lower(valor), 'áéíóúüñ', 'aeiouun'), '[^a-z]+'
  ) AS token
  WHERE token <> '';
$$;

WITH elegibles AS (
  SELECT p.*, u.id AS usuario_id
  FROM altas_catalogo_pit p JOIN usuarios u
    ON lower(u.correo_institucional) = p.correo
   AND alta_catalogo_identidad(u.nombre || ' ' || u.apellidos) = alta_catalogo_identidad(p.nombre)
   AND u.rol = 'tutor' AND u.estado = 'activo'
  WHERE NOT EXISTS (
    SELECT 1 FROM tutores t WHERE t.catalogo_materias_id = p.perfil_id AND t.usuario_id <> u.id
  )
), vinculados AS (
  UPDATE tutores t SET catalogo_materias_id = e.perfil_id
  FROM elegibles e WHERE t.usuario_id = e.usuario_id AND t.catalogo_materias_id IS NULL
  RETURNING t.id
), nuevos AS (
  INSERT INTO tutores (usuario_id, catalogo_materias_id, cubiculo, max_tutorados, acepta_tutorados)
  SELECT e.usuario_id, e.perfil_id, e.cubiculo, e.cupo, true FROM elegibles e
  WHERE NOT EXISTS (SELECT 1 FROM tutores t WHERE t.usuario_id = e.usuario_id)
  ON CONFLICT DO NOTHING
  RETURNING id, catalogo_materias_id
)
INSERT INTO tutor_horarios (tutor_id, dia_semana, hora_inicio, hora_fin)
SELECT t.id, h.dia, h.inicio, h.fin
FROM nuevos t JOIN altas_catalogo_pit p ON p.perfil_id = t.catalogo_materias_id
CROSS JOIN LATERAL (VALUES (p.dia_1, p.inicio_1, p.fin_1), (p.dia_2, p.inicio_2, p.fin_2)) AS h(dia, inicio, fin)
ON CONFLICT (tutor_id, dia_semana, hora_inicio) DO NOTHING;
