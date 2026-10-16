# Idiomas

Cursos para aprender 9 idiomas desde el español: inglés, portugués, francés, italiano, alemán, chino, japonés, coreano y ruso.

## Qué incluye

- **793 palabras y frases por idioma** en 32 unidades con lecciones cortas, notas de gramática y un camino que se va desbloqueando (o «⏭ Saltar» con una prueba de 10 preguntas).
- **10 diálogos por idioma** con dos voces, texto/traducción ocultables y preguntas de comprensión.
- **Ejercicios variados**: elegir el significado, escuchar y elegir, del español al idioma, armar la frase, dictado y «dilo en voz alta» con el micrófono.
- **🔁 Repaso espaciado**: cada palabra vuelve justo antes de que la olvides (1 → 3 → ×facilidad días); los fallos vuelven al día siguiente.
- **🎯 Meta diaria** (10/20/30/50 ejercicios) con anillo de progreso, y **calendario de actividad** de las últimas 15 semanas con racha actual y mejor racha.
- **★ Favoritas**: guarda palabras desde la lista o tras cualquier respuesta, fíltralas y practícalas aparte.
- **Atajos de teclado** en computadora: `1`–`4` eligen opción, `Espacio` repite el audio, `L` lo repite lento, `Enter` continúa y `Esc` sale.
- **💾 Copia de seguridad**: descarga y restaura todo tu progreso (todos los idiomas) desde la portada.
- Modo oscuro, voz y velocidad ajustables, funciona sin conexión e instalable como app (PWA).

## Estructura

```
index.html                  Portada: elegir idioma, continuar, resumen y copia de seguridad
app.html                    La app (se abre como app.html?lang=<código>)
langs.js                    Catálogo de idiomas que usan la portada y la app
lang_<código>.js            Contenido de cada idioma (cfg, units, items, dialogues)
<idioma>_fluency_plan.html  Redirecciones desde las direcciones antiguas
sw.js                       Caché sin conexión (sube VERSION al cambiar archivos)
```

## Editar el contenido

Cada `lang_<código>.js` define `window.LANG_DATA = {cfg, units, items, dialogues}`.
Cada frase es `{"t": texto, "r": pronunciación, "es": traducción, "u": unidad}` y se identifica por su id (`a-…`), que es el mismo en todos los idiomas.

El progreso se guarda por id. No borres ni renombres ids existentes: corrige el texto y añade frases nuevas con ids nuevos.

Para añadir un idioma: crea su `lang_<código>.js`, agrégalo a `langs.js` y a la lista de `sw.js`.

## Publicar

Son archivos estáticos: sirven tal cual en GitHub Pages, Netlify, etc. **El micrófono solo funciona por `https://`** (o en `localhost`), no al abrir el archivo directamente.

El progreso de versiones anteriores se conserva: se usan las mismas claves de `localStorage` (incluido el alemán de la versión anterior, que se migra al abrirlo).
