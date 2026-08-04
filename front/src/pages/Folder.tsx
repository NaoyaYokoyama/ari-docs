function Folder() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">
        Folder
      </h1>

      <div className="space-y-2">
        <div className="rounded border p-3">
          📁 Project A
        </div>

        <div className="rounded border p-3">
          📁 Project B
        </div>

        <div className="rounded border p-3">
          📁 Personal
        </div>
      </div>
    </div>
  );
}

export default Folder;
