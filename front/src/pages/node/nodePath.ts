// フォルダ画面のパス（folder/ からの相対パス、区切りは /）

// "a/b/c" -> "a/b"、"a" -> ""
export function parentPath(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

// "a/b/c" -> "c"
export function baseName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function joinPath(dir: string, name: string) {
  return dir ? `${dir}/${name}` : name;
}
