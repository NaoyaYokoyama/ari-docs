import type { Node } from "../types/node";

type Props = {
  nodes: Node[];
  onOpenFolder: (path: string) => void;
};

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

import { FolderStatus, FolderStatusInfo } from "../types/folderStatus";
import { NodeType } from "../types/nodeType";


const columns: ColumnDef<Node>[] = [
  {
    id: "icon",
    header: "",
    cell: ({ row }) => {
      switch (row.original.nodeType) {
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
    accessorKey: "updatedBy",
    header: "更新者",
  },
  {
    accessorKey: "updatedAt",
    header: "更新日時",
    cell: ({ getValue }) => {
      return getValue<String>()
    }
  },
];

function NodeTable({ nodes, onOpenFolder, }: Props) {
  const table = useReactTable({
    data: nodes,
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
      className="hover:bg-slate-100 cursor-pointer"
      onClick={() => {
        if (row.original.nodeType === NodeType.Folder) {
          onOpenFolder(row.original.path);
        }
      }}
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

export default NodeTable;
