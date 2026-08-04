import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

type Folder = {
  name: string;
  status: string;
  updatedBy: string;
  updatedAt: string;
};

const data: Folder[] = [
  {
    name: "ari-docs",
    status: "Working",
    updatedBy: "Naoya",
    updatedAt: "2026/08/03",
  },
  {
    name: "OSS",
    status: "Completed",
    updatedBy: "Naoya",
    updatedAt: "2026/08/01",
  },
];

const columns: ColumnDef<Folder>[] = [
  {
    accessorKey: "name",
    header: "名前",
  },
  {
    accessorKey: "status",
    header: "状態",
  },
  {
    accessorKey: "updatedBy",
    header: "更新者",
  },
  {
    accessorKey: "updatedAt",
    header: "更新日",
  },
];

function FolderTable() {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <table className="w-full border-collapse">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                className="border-b px-4 py-2 text-left"
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext()
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>

      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr
            key={row.id}
            className="hover:bg-slate-100"
          >
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                className="border-b px-4 py-2"
              >
                {flexRender(
                  cell.column.columnDef.cell,
                  cell.getContext()
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default FolderTable;
