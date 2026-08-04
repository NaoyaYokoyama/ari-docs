import {
  Folder as FolderIcon,
  FileText,
} from "lucide-react";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import type { ColumnDef } from "@tanstack/react-table";
import type { Folder } from "../types/folder";

import { FolderStatus, FolderStatusInfo } from "../types/folderStatus";
import { NodeType } from "../types/nodeType";
import { folders } from "../mock/folder";

const columns: ColumnDef<Folder>[] = [
  {
    id: "icon",
    header: "",
    cell: ({ row }) => {
      switch (row.original.type) {
        case NodeType.Folder:
          return <FolderIcon size={18} />;
        case NodeType.File:
          return <FileText size={18} />;
      }
    },
    enableSorting: false,
  },
  {
    accessorKey: "name",
    header: "名前",
  },
  {
    accessorKey: "status",
    header: "状態",
    cell: ({ getValue }) => {
      const status = getValue<FolderStatus>();
      const info = FolderStatusInfo[status];

      return (
        <span className="flex items-center gap-2">
        <span className={info.color}>●</span>
        <span>{info.label}</span>
        </span>
      );
    },
  },
  {
    accessorKey: "lastUpdatedBy",
    header: "更新者",
  },
  {
    accessorKey: "updatedAt",
    header: "更新日時",
    cell: ({ getValue }) => {
      const date = new Date(getValue<string>());
      return date.toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
  },
];

function FolderTable() {
  const table = useReactTable({
    data: folders,
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
      <tr key={row.id} className="hover:bg-slate-100">
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
