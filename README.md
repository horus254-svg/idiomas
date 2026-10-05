# Idiomas

Planes de un año para aprender 9 idiomas desde el español: chino, inglés, portugués, coreano, ruso, japonés, italiano, francés y alemán.

## Qué incluye

- **Unas 480 frases y palabras por idioma**, en 13 secciones: pronunciación/alfabeto, las 4 fases del plan, vocabulario temático, situaciones reales (hotel, farmacia, dinero, teléfono, quejas, hobbies) y hora y calendario.
- **▶ Audio** con la voz del dispositivo (con respaldo en línea) y velocidad ajustable; 🐢 para oír más despacio.
- **🎤 Micrófono**: compara tu pronunciación con la frase (ignora mayúsculas, signos y tildes).
- **🔁 Repaso de hoy**: repetición espaciada. Cada frase que aciertas vuelve a los 1, 2, 4, 8, 16… días.
- **🎯 Práctica** con 5 modos: escuchar y elegir, leer y elegir, del español al idioma, dictado y «dilo tú». Puedes practicar una sección, lo ya practicado, lo difícil, tus favoritas o todo.
- **📊 Progreso**: racha, XP y meta diaria, calendario de actividad y dominio por sección.
- **Buscador**, ★ favoritas, modo oscuro, ocultar pronunciación o traducción (modo autoevaluación).
- **Copia de seguridad** del progreso (descargar/restaurar) desde la página de inicio.

## Estructura

```
index.html                 Página de inicio (elige idioma, progreso, copia de seguridad)
<idioma>_fluency_plan.html Página de cada idioma (solo carga sus datos y el motor)
assets/app.js              Motor compartido (tarjetas, voz, micrófono, repaso, práctica…)
assets/app.css             Estilos compartidos
assets/catalog.js          Lista de idiomas para la página de inicio
data/<código>.js           Contenido de cada idioma
```

## Editar el contenido

Cada `data/<código>.js` define `window.LANG_DATA` con sus secciones (`phases`). Cada frase es `{"t": texto, "r": pronunciación, "es": traducción}`.

El progreso se guarda por **posición** de cada frase. Para no mezclar el progreso de nadie:
- añade frases nuevas **al final** de un grupo, o crea un grupo o sección nuevos al final;
- no borres ni reordenes frases existentes (corregir el texto de una sí se puede).

Si añades frases, actualiza también `total` en `assets/catalog.js`.

## Publicar

Son archivos estáticos: sirven tal cual en GitHub Pages, Netlify, etc. **El micrófono solo funciona por `https://`** (o en `localhost`), no al abrir el archivo directamente.

El progreso de la versión anterior se conserva: se usan las mismas claves de `localStorage`.
