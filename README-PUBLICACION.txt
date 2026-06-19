Paquete GitHub Pages 1077

Contenido:
- lector-qr.html: PWA para docentes/directivos autorizados.
- portal-docente.html: portal para habilitar indice, actividades y alumnos.
- alumnos.html: indice publico de actividades habilitadas.
- aie-public-config.js: configuracion publica sin secretos.

Este paquete no incluye service role, tokens, contrasenas ni el administrador local.

Para el modo directo sin PC encendida, este paquete usa Supabase URL y anon key publica.
La anon key no es service role y no otorga permisos si RLS/RPC estan bien configurados.

AIE_PUBLIC_BACKEND_BASE_URL_1077 es opcional para el flujo actual.
Solo se usa si mas adelante alguna pantalla necesita endpoints propios en un backend HTTPS publico.

Tambien hay que agregar en Supabase Auth las Redirect URLs publicas:
- https://escuela1077buenosaires-edu.github.io/escuela1077buenosaires-edu/portal-docente.html
- https://escuela1077buenosaires-edu.github.io/escuela1077buenosaires-edu/lector-qr.html
- https://escuela1077buenosaires-edu.github.io/escuela1077buenosaires-edu/
