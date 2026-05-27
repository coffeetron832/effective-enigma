import fs from "fs";
import path from "path";

export async function loadPlaylist(dir) {

  const files = fs.readdirSync(dir);

  return files
    .filter(file =>
      /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file)
    )
    .map(file => ({
      name: file,
      path: path.join(dir, file)
    }));
}