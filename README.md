# BuyBot

Prototipo de gestión comercial para el flujo de compra de deuda. La revisión y el primer contacto son demostrativos: no se conecta a sistemas bancarios ni a WhatsApp.

## Ejecutar

```bash
npm install
npm run dev
```

Para generar una compilación de producción:

```bash
npm run build
```

## Funciones

- Dashboard con meta diaria de 100 contactos e indicadores separados.
- Cartera de 25 prospectos ficticios con resultados determinísticos.
- Automatización por etapas con iniciar, pausar, reanudar y detener.
- Importación de `.xlsx`, `.xls` y `.csv` con detección de columnas, filas inválidas y duplicados por DNI o teléfono.
- Ficha de prospecto, segunda revisión, historial exportable y reinicio de demostración.
- Estado de la demo persistido en `localStorage`.

La importación reconoce columnas equivalentes a DNI, Nombre y WhatsApp. Los DNI deben tener ocho dígitos y los teléfonos peruanos, nueve.
