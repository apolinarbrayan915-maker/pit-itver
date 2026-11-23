# Recomendador semántico del PIT

El botón circular con lupa abre el buscador desde cualquier pestaña del portal del alumno. El atajo en **Mi tutor(a)** abre el mismo panel.

En **Mi tutor(a)** el alumno puede describir una duda y abrir los perfiles recomendados. Express exige una sesión de alumno y consulta el cupo vigente en PostgreSQL. El servicio Python compara la duda con los CV de ese conjunto usando Sentence-BERT multilingüe. El clasificador conserva la ponderación original de afinidad general (45 %), proyectos (35 %) y certificaciones (20 %), con un umbral de 0,40. Si ningún perfil alcanza el umbral, el portal sugiere consultar el directorio o contactar a Coordinación.

La selección y los cambios de tutor se realizan desde los controles del PIT. La API presenta el desglose de afinidad. Los archivos fuente, los fragmentos del CV y la caché quedan del lado del servicio. Este flujo no guarda la consulta del alumno.

## Activación local

1. Crea un directorio privado con un archivo `tutores.json` y una carpeta `cvs` con los documentos autorizados. El ID de cada entrada es el correo institucional de su perfil de tutor en el PIT. Usa este formato:

   ```json
   [
     {"id": "docente@veracruz.tecnm.mx", "nombre": "Nombre del docente", "archivo": "docente.pdf"}
   ]
   ```

   El parser usa PDF con texto, DOCX o TXT. El directorio necesita permiso de escritura para la caché. Reinicia el servicio al actualizar el catálogo.

2. Desde `recomendador/`, instala y levanta el servicio con Python 3.11 o 3.12:

   ```powershell
   python -m pip install -r requirements.txt
   $env:RECOMENDADOR_DATOS = 'C:\ruta\al\catalogo-privado'
   $env:RECOMENDADOR_TOKEN = 'usa-aqui-un-token-aleatorio-de-al-menos-32-caracteres'
   python -m uvicorn servicio:app --host 127.0.0.1 --port 8000 --workers 1
   ```

3. Configura `RECOMENDADOR_URL=http://127.0.0.1:8000` y el mismo `RECOMENDADOR_TOKEN` en el `.env` de Express. Arranca el PIT con la base local de prueba y entra como alumno. En **Mi tutor(a)** escribe una pregunta que coincida con uno de los CV del catálogo. Prueba también una duda fuera del catálogo.

Para Vercel, despliega el servicio Python por separado con HTTPS y un volumen privado para el catálogo. Configura URL y token solo en el entorno del servidor. El primer arranque descarga los pesos del modelo si la caché de Hugging Face está vacía. El PIT puede arrancar con su configuración habitual, con la búsqueda semántica oculta hasta que se activen ambas variables.

El `Dockerfile` del servicio usa PyTorch para CPU. Usa `recomendador/` como contexto de construcción, monta el catálogo autorizado con escritura en `/datos` e inyecta `RECOMENDADOR_TOKEN` desde el gestor de secretos del alojamiento. Configura Vercel con la URL HTTPS del servicio y el mismo token. El Dockerfile copia solo el código y sus dependencias.
