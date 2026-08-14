import { FolderStatus, FolderStatusInfo } from "@/types/folderStatus";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

type Props = {
  nodes: Node[];
  onOpenFolder: (path: string) => void;
  onOpenNode: (node: Node) => void;
};

import type { ColumnDef } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { EllipsisVertical,FileText, Folder as FolderIcon } from "lucide-react";

function NodeTable({ nodes, onOpenFolder, onOpenNode }: Props) {
  const columns: ColumnDef<Node>[] = [
    {
      accessorKey: "details",
      header: "",
      size: 5,
      enableSorting: false,
      meta: {
        className: "px-1",
      },
      cell: ({ row }) => {
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenNode(row.original);
            }}
            className="flex h-full w-full items-center justify-center hover:bg-slate-300"
          >
            <EllipsisVertical size={18} />
          </button>
        );
      },
    },
    {
      id: "icon",
      header: "",
      size: 5,
      enableSorting: false,
      cell: ({ row }) => {
        switch (row.original.nodeType) {
          case NodeType.Folder:
            return <FolderIcon size={18} />;
          case NodeType.File:
            return <FileText size={18} />;
        }
      },
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
        return getValue<string>();
      },
    },
  ];

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
                style={{ width: header.column.getSize() }}
                className="border-b px-4 py-2 text-left"
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
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
            className="cursor-pointer hover:bg-slate-100"
            onClick={() => {
              if (row.original.nodeType === NodeType.Folder) {
                onOpenFolder(row.original.path);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenNode(row.original);
          }}
          >
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                style={{ width: cell.column.getSize() }}
                className="border-b px-1 py-1"
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default NodeTable;
