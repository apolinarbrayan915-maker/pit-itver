// Paleta institucional del Tecnológico Nacional de México (azul del logotipo oficial).
// Los nombres de los tokens se conservan para no tocar cada clase del HTML:
//   tecnmGreen → azul institucional principal (#18396A, tomado del logotipo)
//   tecnmDark  → azul marino para fondos oscuros, encabezados y hover
//   tecnmGold  → azul claro de acento (botones secundarios, chips, texto sobre fondo oscuro)
//   tecnmBlue  → azul medio para íconos y texto de acento sobre fondo blanco
// Se protege por si el CDN de Tailwind no carga (sin internet): la app sigue funcionando.
if (window.tailwind) {
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    tecnmGreen: '#18396A',
                    tecnmDark: '#0E2444',
                    tecnmGold: '#9DBCE8',
                    tecnmGoldDark: '#7FA6DE',
                    tecnmBlue: '#2C64B0',
                    tecnmSand: '#C7D9F2',
                    tecnmGray: '#6F7271',
                    gobGreen: '#0E2444',
                },
                fontFamily: {
                    montserrat: ['Montserrat', 'sans-serif'],
                },
            },
        },
    };
}
