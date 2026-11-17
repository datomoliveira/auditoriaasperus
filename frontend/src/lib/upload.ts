import { zip } from "fflate";

export interface UploadEntry {
  /** Caminho relativo preservando a estrutura de pastas (ex.: "projeto/src/index.ts"). */
  path: string;
  file: File;
}

/** Pastas que só pesam no envio e não interessam à análise. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "coverage",
  ".cache",
  ".parcel-cache",
  ".turbo",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "vendor",
  ".idea",
  ".vscode",
]);

function isIgnoredPath(path: string) {
  return path.split("/").some((segment) => IGNORED_DIRS.has(segment));
}

/** Entradas a partir de um <input webkitdirectory> (usa webkitRelativePath). */
export function entriesFromFileList(list: FileList): UploadEntry[] {
  return Array.from(list)
    .map((file) => ({
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      file,
    }))
    .filter((entry) => !isIgnoredPath(entry.path));
}

/**
 * Coleta arquivos de um arraste. Quando o navegador expõe a API de sistema de
 * arquivos (Chrome/Edge/Safari), percorre pastas soltas recursivamente.
 */
export async function collectDroppedEntries(dt: DataTransfer): Promise<UploadEntry[]> {
  const roots: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }

  // Fallback para navegadores sem a API de diretórios.
  if (roots.length === 0) {
    return Array.from(dt.files)
      .map((file) => ({ path: file.name, file }))
      .filter((entry) => !isIgnoredPath(entry.path));
  }

  const out: UploadEntry[] = [];
  for (const entry of roots) await walkEntry(entry, "", out);
  return out;
}

async function walkEntry(entry: FileSystemEntry, base: string, out: UploadEntry[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    const path = base + entry.name;
    if (!isIgnoredPath(path)) out.push({ path, file });
    return;
  }

  if (entry.isDirectory) {
    if (IGNORED_DIRS.has(entry.name)) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const nextBase = `${base}${entry.name}/`;
    // readEntries entrega em lotes; repetimos até vir um lote vazio.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walkEntry(child, nextBase, out);
    }
  }
}

/** Compacta as entradas em um único .zip (preservando pastas) pronto para envio. */
export function zipEntries(entries: UploadEntry[], zipName: string): Promise<File> {
  return Promise.all(
    entries.map(
      async (entry) => [entry.path, new Uint8Array(await entry.file.arrayBuffer())] as const,
    ),
  ).then(
    (pairs) =>
      new Promise<File>((resolve, reject) => {
        const data: Record<string, Uint8Array> = {};
        for (const [path, bytes] of pairs) data[path] = bytes;
        zip(data, { level: 6 }, (err, out) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(new File([out], zipName, { type: "application/zip" }));
        });
      }),
  );
}
