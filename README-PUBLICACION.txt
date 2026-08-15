Paquete GitHub Pages 1077

Contenido:
- index.html: punto de entrada unico para alumnos y personal docente.
- acceso-alumnos.html: accesos al indice de actividades y a la ayuda de Eduten.
- portal-funcional.html: PWA centralizadora de funciones del personal docente.
- lector-qr.html: PWA para docentes/directivos autorizados.
- portal-docente.html: portal para habilitar indice, actividades y alumnos.
- alumnos.html: indice publico de actividades habilitadas.
- aie-public-config.js: configuracion publica sin secretos.
- aie-login-redirect.js: redireccion opcional a login Google desde tarjetas protegidas.
- solicitud-actividad.html: formulario publico autenticado con Google.
- solicitudes-1077: puente seguro entre Supabase Auth y el backend Apps Script.
- aie-hub.webmanifest y aie-hub-sw.js: instalacion/cache basico del panel central.

Este paquete no incluye service role, tokens, contrasenas ni el administrador local.

Para el modo directo sin PC encendida, este paquete usa Supabase URL y anon key publica.
La anon key no es service role y no otorga permisos si RLS/RPC estan bien configurados.

AIE_PUBLIC_BACKEND_BASE_URL_1077 es opcional para el flujo actual.
Solo se usa si mas adelante alguna pantalla necesita endpoints propios en un backend HTTPS publico.

Tambien hay que agregar en Supabase Auth las Redirect URLs publicas:
- https://escuela1077buenosaires-edu.github.io/escuela1077buenosaires-edu/portal-docente.html
- https://escuela1077buenosaires-edu.github.io/escuela1077buenosaires-edu/lector-qr.html
- https://escuela1077buenosaires-edu.github.io/escuela1077buenosaires-edu/
