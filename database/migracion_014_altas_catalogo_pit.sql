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
