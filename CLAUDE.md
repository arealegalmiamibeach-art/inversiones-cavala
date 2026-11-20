# Despliegue a producción

Este repo **no tiene auto-deploy** conectado entre GitHub y Vercel: hacer
`git push` a `main` deja el código en GitHub pero NO actualiza
`inversiones-cavala-eight.vercel.app`. Hay que desplegar a mano después de
cada push:

```
npx vercel --prod --yes
```

Antes de correrlo, confirmar que compila limpio (Vercel usa el mismo build):

```
npm run build
```

Para revisar qué versión está realmente en producción (y su fecha) sin
adivinar por lo que se ve en pantalla:

```
npx vercel inspect inversiones-cavala-eight.vercel.app
```

**Arreglo pendiente de verdad:** conectar el repo en Vercel → Project
Settings → Git, para que cada push a `main` dispare el deploy solo. Mientras
eso no esté hecho, todo cambio requiere el `vercel --prod --yes` manual.
