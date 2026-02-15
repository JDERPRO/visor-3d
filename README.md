# Bitform Visor 3D 🏗️

Visor BIM 3D independiente construido con [Vite](https://vitejs.dev/) y [@thatopen/components](https://github.com/ThatOpen/engine_components).

Diseñado para funcionar **standalone** o **embebido via iframe** en tu web de Google Apps Script.

## 🚀 Quick Start

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview
```

## 📦 Estructura

```
00_visor-3d/
├── public/
│   └── vite.svg          # Favicon
├── src/
│   ├── main.js           # Entry point, orquestación
│   ├── viewer.js          # Core del visor 3D (@thatopen/components)
│   ├── ui.js             # Utilidades UI (loading, toast)
│   └── style.css         # Design system completo
├── index.html            # HTML principal
├── vite.config.js        # Configuración Vite + CORS
└── package.json
```

## 🔗 Integración con Google Apps Script (iframe)

### Opción 1: URL con parámetros
```html
<iframe 
  src="https://tu-visor.vercel.app/?model=URL_DEL_FRAG&name=MiModelo"
  width="100%" 
  height="600" 
  frameborder="0"
  allow="fullscreen">
</iframe>
```

### Opción 2: PostMessage API
```javascript
// Desde tu web GAS, envía un mensaje al iframe
const iframe = document.getElementById('viewer-iframe');

// Cargar modelo desde URL
iframe.contentWindow.postMessage({
  type: 'load-model',
  url: 'https://drive.google.com/uc?id=FILE_ID&export=download',
  name: 'Mi Modelo BIM'
}, '*');

// Cargar modelo desde Base64 (útil con google.script.run)
iframe.contentWindow.postMessage({
  type: 'load-model-base64',
  base64: fragBase64Data,
  name: 'Modelo.frag'
}, '*');

// Encuadrar cámara
iframe.contentWindow.postMessage({ type: 'fit-model' }, '*');

// Escuchar cuando el modelo se cargó
window.addEventListener('message', (event) => {
  if (event.data.type === 'model-loaded') {
    console.log('Modelo cargado:', event.data.success);
  }
});
```

## 🌐 Deploy

### GitHub Pages (Gratis)
```bash
# Ajusta la base en vite.config.js a '/nombre-repo/'
npm run deploy:gh
```

### Vercel (Gratis - Hobby)
1. Conecta tu repositorio en [vercel.com](https://vercel.com)
2. Framework: **Vite**
3. Deploy automático en cada push

### Netlify (Gratis)
1. Conecta tu repositorio en [netlify.com](https://netlify.com)
2. Build command: `npm run build`
3. Publish directory: `dist`

## ⌨️ Atajos de Teclado

| Tecla | Acción |
|-------|--------|
| `F` | Encuadrar modelo |
| `G` | Mostrar/Ocultar grid |
| `P` | Panel de propiedades |
| `Esc` | Cerrar paneles |

## 📋 Funcionalidades

- ✅ Visor 3D con @thatopen/components v2.1
- ✅ Cargar archivos .frag (drag & drop o file picker)
- ✅ Vistas predefinidas (Frontal, Superior, Derecha, Isométrica)
- ✅ Grid configurable
- ✅ Pantalla completa
- ✅ Comunicación via postMessage para iframe
- ✅ Parámetros URL para cargar modelos automáticamente
- ✅ Diseño responsive
- ✅ Loading screen con animación 3D
- ✅ Listo para deploy (GitHub Pages, Vercel, Netlify)

## 💰 Costo

- **Desarrollo (Vite):** $0 — gratuito para siempre
- **@thatopen/components:** $0 — código abierto
- **Hosting:** $0 — GitHub Pages, Vercel Hobby, o Netlify gratis
- **Dominio personalizado:** ~$10-15/año (opcional)
