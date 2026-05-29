import fs from "fs";
import path from "path";

export async function loadPlaylist(dir) {
  // Convertimos el directorio base a una ruta absoluta real e incuestionable
  const absoluteDir = path.resolve(dir);

  if (!fs.existsSync(absoluteDir)) {
    throw new Error(`The directory does not exist: ${absoluteDir}`);
  }

  const files = fs.readdirSync(absoluteDir);

  return files
    .filter(file =>
      /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file)
    )
    .map(file => {
      // Reemplazamos el nombre para quitarle la extensión en la interfaz (estética)
      const cleanName = path.basename(file, path.extname(file));
      
      return {
        name: cleanName,
        path: path.join(absoluteDir, file), // Ruta absoluta garantizada para mpv
        artist: "Local Track",
        duration: 180 // Duración por defecto segura en segundos
      };
    });
}
