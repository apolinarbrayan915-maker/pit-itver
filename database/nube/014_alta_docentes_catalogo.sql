-- =============================================================================
--  014 · Alta como tutores de los 67 docentes del catálogo de Sistemas
--  Generado por scripts/generar-altas-catalogo.js · no editar a mano.
--  Correos provisionales (pit.evaluacion.mp-…): cámbialos por los institucionales
--  reales antes del piloto. Contraseña: la misma de las cuentas demo.
-- =============================================================================
SET search_path = pit;

CREATE TEMP TABLE _pw ON COMMIT DROP AS
  SELECT password_hash FROM usuarios WHERE lower(correo_institucional) = 'noemi.tp@veracruz.tecnm.mx';

CREATE TEMP TABLE _docentes (perfil_id text, nombre text, apellidos text, rfc text, correo text, areas text[], especialidad text) ON COMMIT DROP;
INSERT INTO _docentes VALUES
('mp-23319', 'Abelardo', 'Rodríguez León', 'MPRO023319PT', 'pit.evaluacion.mp-23319@veracruz.tecnm.mx', ARRAY['Cómputo paralelo y distribuido', 'Gráficos, interacción y UX', 'Programación y algoritmos']::text[], 'Cómputo paralelo y distribuido'),
('mp-63244', 'Agustin', 'Colina Sanchez', 'MPRO063244PT', 'pit.evaluacion.mp-63244@veracruz.tecnm.mx', ARRAY['Matemáticas y simulación']::text[], 'Matemáticas y simulación'),
('mp-170362', 'Alberth', 'Hammel Dammel', 'MPRO170362PT', 'pit.evaluacion.mp-170362@veracruz.tecnm.mx', ARRAY['IA y análisis de datos']::text[], 'IA y análisis de datos'),
('mp-169796', 'Alexander', 'Fausting', 'MPRO169796PT', 'pit.evaluacion.mp-169796@veracruz.tecnm.mx', ARRAY['Desarrollo web y móvil', 'Gráficos, interacción y UX', 'Ingeniería de software y proyectos', 'Lenguajes y compiladores', 'Programación y algoritmos', 'Sistemas operativos e infraestructura']::text[], 'Desarrollo web y móvil'),
('mp-63162', 'Amanda', 'Caracas Capetillo', 'MPRO063162PT', 'pit.evaluacion.mp-63162@veracruz.tecnm.mx', ARRAY['Matemáticas y simulación']::text[], 'Matemáticas y simulación'),
('mp-172286', 'Arturo', 'Rendón', 'MPRO172286PT', 'pit.evaluacion.mp-172286@veracruz.tecnm.mx', ARRAY['Ingeniería de software y proyectos']::text[], 'Ingeniería de software y proyectos'),
('mp-181170', 'Berenice', 'Lagunes Padilla', 'MPRO181170PT', 'pit.evaluacion.mp-181170@veracruz.tecnm.mx', ARRAY['Investigación y formación transversal']::text[], 'Investigación y formación transversal'),
('mp-66356', 'Carlos', 'Lagunes', 'MPRO066356PT', 'pit.evaluacion.mp-66356@veracruz.tecnm.mx', ARRAY['Matemáticas y simulación']::text[], 'Matemáticas y simulación'),
('mp-59309', 'Carlos', 'Ley Borraz', 'MPRO059309PT', 'pit.evaluacion.mp-59309@veracruz.tecnm.mx', ARRAY['Ingeniería de software y proyectos', 'Investigación y formación transversal']::text[], 'Ingeniería de software y proyectos'),
('mp-66355', 'Carlos', 'Olmos', 'MPRO066355PT', 'pit.evaluacion.mp-66355@veracruz.tecnm.mx', ARRAY['Programación y algoritmos']::text[], 'Programación y algoritmos'),
('mp-44715', 'Claudio', 'Yepez Sosa', 'MPRO044715PT', 'pit.evaluacion.mp-44715@veracruz.tecnm.mx', ARRAY['Matemáticas y simulación']::text[], 'Matemáticas y simulación'),
('mp-55388', 'Daniela', 'Hernandez Barrios', 'MPRO055388PT', 'pit.evaluacion.mp-55388@veracruz.tecnm.mx', ARRAY['Programación y algoritmos', 'Sistemas operativos e infraestructura']::text[], 'Programación y algoritmos'),
('mp-169325', 'David', 'Leon', 'MPRO169325PT', 'pit.evaluacion.mp-169325@veracruz.tecnm.mx', ARRAY['Sexo', 'Sexo 24/7']::text[], 'Sexo'),
('mp-14748', 'Delio', 'Coss Camilo', 'MPRO014748PT', 'pit.evaluacion.mp-14748@veracruz.tecnm.mx', ARRAY['Bases de datos', 'Desarrollo web y móvil', 'Programación y algoritmos']::text[], 'Bases de datos'),
('mp-16505', 'Eduardo', 'Trujillo Jiménez', 'MPRO016505PT', 'pit.evaluacion.mp-16505@veracruz.tecnm.mx', ARRAY['Bases de datos', 'Cómputo paralelo y distribuido', 'Programación y algoritmos']::text[], 'Bases de datos'),
('mp-92553', 'Efrén', 'Mendoza Chaparro', 'MPRO092553PT', 'pit.evaluacion.mp-92553@veracruz.tecnm.mx', ARRAY['Investigación y formación transversal', 'Matemáticas y simulación', 'Programación y algoritmos']::text[], 'Investigación y formación transversal'),
('mp-17475', 'Elisa', 'Cano', 'MPRO017475PT', 'pit.evaluacion.mp-17475@veracruz.tecnm.mx', ARRAY['Programación y algoritmos']::text[], 'Programación y algoritmos'),
('mp-135869', 'Enrique', 'Soto Andrade', 'MPRO135869PT', 'pit.evaluacion.mp-135869@veracruz.tecnm.mx', ARRAY['Bases de datos', 'Lenguajes y compiladores']::text[], 'Bases de datos'),
('mp-181193', 'Erick', 'López Sánchez', 'MPRO181193PT', 'pit.evaluacion.mp-181193@veracruz.tecnm.mx', ARRAY['Fisica']::text[], 'Fisica'),
('mp-16319', 'Esteban', 'Mendoza', 'MPRO016319PT', 'pit.evaluacion.mp-16319@veracruz.tecnm.mx', ARRAY['Programación y algoritmos', 'Sistemas operativos e infraestructura']::text[], 'Programación y algoritmos'),
('mp-14749', 'Evaristo', 'Pacheco', 'MPRO014749PT', 'pit.evaluacion.mp-14749@veracruz.tecnm.mx', ARRAY['Bases de datos', 'Desarrollo web y móvil', 'Programación y algoritmos', 'Redes y servicios']::text[], 'Bases de datos'),
('mp-16316', 'Ezequiel', 'Piña Ortiz', 'MPRO016316PT', 'pit.evaluacion.mp-16316@veracruz.tecnm.mx', ARRAY['Bases de datos', 'Matemáticas y simulación']::text[], 'Bases de datos'),
('mp-45487', 'Felipe', 'Verdalet Guzman', 'MPRO045487PT', 'pit.evaluacion.mp-45487@veracruz.tecnm.mx', ARRAY['Desarrollo web y móvil', 'Ingeniería de software y proyectos', 'Programación y algoritmos', 'Redes y servicios']::text[], 'Desarrollo web y móvil'),
('mp-142898', 'Gabriel Antonio', 'Sanchez Ortiz', 'MPRO142898PT', 'pit.evaluacion.mp-142898@veracruz.tecnm.mx', ARRAY['Redes y servicios']::text[], 'Redes y servicios'),
('mp-26308', 'Gabriel', 'Cedeño Collins', 'MPRO026308PT', 'pit.evaluacion.mp-26308@veracruz.tecnm.mx', ARRAY['Ingeniería de software y proyectos', 'Programación y algoritmos']::text[], 'Ingeniería de software y proyectos'),
('mp-16504', 'Gaby', 'Clavel', 'MPRO016504PT', 'pit.evaluacion.mp-16504@veracruz.tecnm.mx', ARRAY['Lenguajes y compiladores', 'Matemáticas y simulación', 'Programación y algoritmos']::text[], 'Lenguajes y compiladores'),
('mp-16622', 'Gerardo', 'Ortiz Quiroz', 'MPRO016622PT', 'pit.evaluacion.mp-16622@veracruz.tecnm.mx', ARRAY['Matemáticas y simulación', 'Programación y algoritmos']::text[], 'Matemáticas y simulación'),
('mp-16540', 'Héctor', 'Andrade Gómez', 'MPRO016540PT', 'pit.evaluacion.mp-16540@veracruz.tecnm.mx', ARRAY['Arquitectura, hardware y embebidos', 'Ingeniería de software y proyectos', 'Investigación y formación transversal', 'Lenguajes y compiladores', 'Programación y algoritmos']::text[], 'Arquitectura, hardware y embebidos'),
('mp-44769', 'Héctor', 'Pérez Ortíz', 'MPRO044769PT', 'pit.evaluacion.mp-44769@veracruz.tecnm.mx', ARRAY['Matemáticas y simulación', 'Redes y servicios']::text[], 'Matemáticas y simulación'),
('mp-112349', 'J. Manuel', 'Miranda Villagrán', 'MPRO112349PT', 'pit.evaluacion.mp-112349@veracruz.tecnm.mx', ARRAY['Matematias']::text[], 'Matematias'),
('mp-106017', 'Jaír', 'Alayon', 'MPRO106017PT', 'pit.evaluacion.mp-106017@veracruz.tecnm.mx', ARRAY['Matemáticas y simulación']::text[], 'Matemáticas y simulación'),
('mp-18506', 'Jesus', 'Cruzado', 'MPRO018506PT', 'pit.evaluacion.mp-18506@veracruz.tecnm.mx', ARRAY['Bases de datos', 'Ingeniería de software y proyectos']::text[], 'Bases de datos'),
('mp-29302', 'Jesus Fabian', 'Rosales Vega', 'MPRO029302PT', 'pit.evaluacion.mp-29302@veracruz.tecnm.mx', ARRAY['Cómputo paralelo y distribuido', 'Programación y algoritmos']::text[], 'Cómputo paralelo y distribuido'),
('mp-108164', 'Jesus', 'Roque Martinez', 'MPRO108164PT', 'pit.evaluacion.mp-108164@veracruz.tecnm.mx', ARRAY['Matemáticas y simulación']::text[], 'Matemáticas y simulación'),
('mp-40244', 'Jorge', 'Estudillo Ramirez', 'MPRO040244PT', 'pit.evaluacion.mp-40244@veracruz.tecnm.mx', ARRAY['Lenguajes y compiladores', 'Programación y algoritmos']::text[], 'Lenguajes y compiladores'),
('mp-107452', 'Jose Guadalupe', 'Garcia Ramirez', 'MPRO107452PT', 'pit.evaluacion.mp-107452@veracruz.tecnm.mx', ARRAY['Matemáticas y simulación']::text[], 'Matemáticas y simulación'),
('mp-84176', 'Jose Ramon', 'Beltran Guzman', 'MPRO084176PT', 'pit.evaluacion.mp-84176@veracruz.tecnm.mx', ARRAY['Investigación y formación transversal', 'Sistemas operativos e infraestructura']::text[], 'Investigación y formación transversal'),
('mp-167809', 'Juan Manuel', 'Bucio Ballado', 'MPRO167809PT', 'pit.evaluacion.mp-167809@veracruz.tecnm.mx', ARRAY['Investigación y formación transversal']::text[], 'Investigación y formación transversal'),
('mp-131082', 'Karina', 'Gómez Cantarell', 'MPRO131082PT', 'pit.evaluacion.mp-131082@veracruz.tecnm.mx', ARRAY['Ing. De sistemas', 'Ingeniería de sistemas']::text[], 'Ing. De sistemas'),
('mp-16623', 'Leonardo', 'Lezama', 'MPRO016623PT', 'pit.evaluacion.mp-16623@veracruz.tecnm.mx', ARRAY['Arquitectura, hardware y embebidos', 'Redes y servicios', 'Sistemas operativos e infraestructura']::text[], 'Arquitectura, hardware y embebidos'),
('mp-109622', 'Liliana', 'Rangel Renteria', 'MPRO109622PT', 'pit.evaluacion.mp-109622@veracruz.tecnm.mx', ARRAY['Fisica moderna', 'Lenguajes de interfaz', 'Lenguajes e interfaz', 'Principios']::text[], 'Fisica moderna'),
('mp-16539', 'Lizbeth', 'Sánchez Ferrer', 'MPRO016539PT', 'pit.evaluacion.mp-16539@veracruz.tecnm.mx', ARRAY['Arquitectura, hardware y embebidos', 'Redes y servicios']::text[], 'Arquitectura, hardware y embebidos'),
('mp-183695', 'Luis', 'Antonio Cocoletzi', 'MPRO183695PT', 'pit.evaluacion.mp-183695@veracruz.tecnm.mx', ARRAY['Programación y algoritmos']::text[], 'Programación y algoritmos'),
('mp-16842', 'Luis Bernardo', 'Ballesteros Barradas', 'MPRO016842PT', 'pit.evaluacion.mp-16842@veracruz.tecnm.mx', ARRAY['Cómputo paralelo y distribuido', 'Lenguajes y compiladores', 'Programación y algoritmos', 'Sistemas operativos e infraestructura']::text[], 'Cómputo paralelo y distribuido'),
('mp-16678', 'Luis', 'Reyes Rivera', 'MPRO016678PT', 'pit.evaluacion.mp-16678@veracruz.tecnm.mx', ARRAY['Programación y algoritmos']::text[], 'Programación y algoritmos'),
('mp-74707', 'Luis', 'Rivera Lozano', 'MPRO074707PT', 'pit.evaluacion.mp-74707@veracruz.tecnm.mx', ARRAY['Programación y algoritmos']::text[], 'Programación y algoritmos'),
('mp-16529', 'Marco', 'Romo Medina', 'MPRO016529PT', 'pit.evaluacion.mp-16529@veracruz.tecnm.mx', ARRAY['Cómputo paralelo y distribuido', 'Matemáticas y simulación', 'Programación y algoritmos']::text[], 'Cómputo paralelo y distribuido'),
('mp-16545', 'Margarita', 'Ostos', 'MPRO016545PT', 'pit.evaluacion.mp-16545@veracruz.tecnm.mx', ARRAY['Investigación y formación transversal']::text[], 'Investigación y formación transversal'),
('mp-19867', 'María Dolores', 'Castro Valdés', 'MPRO019867PT', 'pit.evaluacion.mp-19867@veracruz.tecnm.mx', ARRAY['Investigación y formación transversal']::text[], 'Investigación y formación transversal'),
('mp-16630', 'Marta', 'Martinez', 'MPRO016630PT', 'pit.evaluacion.mp-16630@veracruz.tecnm.mx', ARRAY['Investigación y formación transversal', 'Lenguajes y compiladores', 'Sistemas operativos e infraestructura']::text[], 'Investigación y formación transversal'),
('mp-16506', 'Martinez', 'San German', 'MPRO016506PT', 'pit.evaluacion.mp-16506@veracruz.tecnm.mx', ARRAY['Bases de datos', 'Desarrollo web y móvil', 'Programación y algoritmos']::text[], 'Bases de datos'),
('mp-93933', 'Miguel Ángel', 'Pérez Cabada', 'MPRO093933PT', 'pit.evaluacion.mp-93933@veracruz.tecnm.mx', ARRAY['Cómputo paralelo y distribuido', 'Desarrollo web y móvil', 'Gráficos, interacción y UX', 'Sistemas operativos e infraestructura']::text[], 'Cómputo paralelo y distribuido'),
('mp-185770', 'Monserrat', 'Ferrari', 'MPRO185770PT', 'pit.evaluacion.mp-185770@veracruz.tecnm.mx', ARRAY['Programación y algoritmos']::text[], 'Programación y algoritmos'),
('mp-16317', 'Ofelia', 'Giraldi', 'MPRO016317PT', 'pit.evaluacion.mp-16317@veracruz.tecnm.mx', ARRAY['Lenguajes y compiladores']::text[], 'Lenguajes y compiladores'),
('mp-16291', 'Patricia', 'Horta Rosado', 'MPRO016291PT', 'pit.evaluacion.mp-16291@veracruz.tecnm.mx', ARRAY['Arquitectura, hardware y embebidos', 'IA y análisis de datos', 'Programación y algoritmos', 'Redes y servicios', 'Sistemas operativos e infraestructura']::text[], 'Arquitectura, hardware y embebidos'),
('mp-16686', 'Rafael Córdoba', 'del Valle', 'MPRO016686PT', 'pit.evaluacion.mp-16686@veracruz.tecnm.mx', ARRAY['Ingeniería de software y proyectos', 'Investigación y formación transversal', 'Programación y algoritmos']::text[], 'Ingeniería de software y proyectos'),
('mp-16538', 'Rafael', 'Rivera', 'MPRO016538PT', 'pit.evaluacion.mp-16538@veracruz.tecnm.mx', ARRAY['Gráficos, interacción y UX', 'IA y análisis de datos', 'Investigación y formación transversal', 'Programación y algoritmos']::text[], 'Gráficos, interacción y UX'),
('mp-109923', 'Raúl Hector', 'Trujillo Jimenez', 'MPRO109923PT', 'pit.evaluacion.mp-109923@veracruz.tecnm.mx', ARRAY['Bases de datos', 'Programación y algoritmos']::text[], 'Bases de datos'),
('mp-92038', 'Reynaldo', 'Guitiérrez Avendaño', 'MPRO092038PT', 'pit.evaluacion.mp-92038@veracruz.tecnm.mx', ARRAY['Ingeniería de software y proyectos']::text[], 'Ingeniería de software y proyectos'),
('mp-16677', 'Ricardo Rodríguez de', 'la Lanza', 'MPRO016677PT', 'pit.evaluacion.mp-16677@veracruz.tecnm.mx', ARRAY['Bases de datos', 'Ingeniería de software y proyectos', 'Investigación y formación transversal', 'Programación y algoritmos']::text[], 'Bases de datos'),
('mp-21402', 'Rocio', 'Gonzalez Contreras', 'MPRO021402PT', 'pit.evaluacion.mp-21402@veracruz.tecnm.mx', ARRAY['Arquitectura, hardware y embebidos', 'Programación y algoritmos', 'Redes y servicios']::text[], 'Arquitectura, hardware y embebidos'),
('mp-43176', 'Rodolfo', 'Senties', 'MPRO043176PT', 'pit.evaluacion.mp-43176@veracruz.tecnm.mx', ARRAY['Investigación y formación transversal']::text[], 'Investigación y formación transversal'),
('mp-16507', 'Senen', 'Juarez Tinoco', 'MPRO016507PT', 'pit.evaluacion.mp-16507@veracruz.tecnm.mx', ARRAY['Bases de datos', 'Investigación y formación transversal', 'Programación y algoritmos']::text[], 'Bases de datos'),
('mp-189176', 'Sergio', 'Rios', 'MPRO189176PT', 'pit.evaluacion.mp-189176@veracruz.tecnm.mx', ARRAY['Fund.Telecom', 'Sistemas de información']::text[], 'Fund.Telecom'),
('mp-79156', 'Sidney René', 'Toledo Martínez', 'MPRO079156PT', 'pit.evaluacion.mp-79156@veracruz.tecnm.mx', ARRAY['Programación y algoritmos']::text[], 'Programación y algoritmos'),
('mp-17096', 'Victor', 'Cruz', 'MPRO017096PT', 'pit.evaluacion.mp-17096@veracruz.tecnm.mx', ARRAY['DESI']::text[], 'DESI'),
('mp-180044', 'Violeta del Rocío', 'Hernández Campos', 'MPRO180044PT', 'pit.evaluacion.mp-180044@veracruz.tecnm.mx', ARRAY['Investigación y formación transversal']::text[], 'Investigación y formación transversal');

-- 1. Cuentas de usuario con rol tutor (si el correo o el RFC ya existen, no se tocan)
INSERT INTO usuarios (no_control_o_rfc, nombre, apellidos, correo_institucional, password_hash, rol)
SELECT d.rfc, d.nombre, d.apellidos, d.correo, p.password_hash, 'tutor'
  FROM _docentes d CROSS JOIN _pw p
ON CONFLICT DO NOTHING;

-- 2. Perfil de tutor, cupo, cubículo y dos bloques semanales (función de la migración 013)
SELECT confirmar_altas_catalogo_pit();

-- 3. Áreas de apoyo para la lupa (solo si el tutor aún no captura las suyas)
UPDATE tutores t
   SET areas_apoyo = d.areas,
       especialidad = COALESCE(t.especialidad, d.especialidad),
       formacion_tutorial = COALESCE(t.formacion_tutorial, 'En formación')
  FROM _docentes d
 WHERE t.catalogo_materias_id = d.perfil_id
   AND cardinality(t.areas_apoyo) = 0;
