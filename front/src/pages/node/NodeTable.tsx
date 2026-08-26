import { FolderStatus, FolderStatusInfo } from "@/types/folderStatus";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";
import { uploadNode } from "@/api/node";

type Props = {
  nodes: Node[];
  currentPath: string;
  onOpenFolder: (path: string) => void;
  onOpenNode: (node: Node) => void;
  reload: () => void;
};

import type { ColumnDef } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { EllipsisVertical,FileText, Folder as FolderIcon } from "lucide-react";

function NodeTable({ nodes, currentPath, onOpenFolder, onOpenNode, reload }: Props) {
  const handleOpen = async (node: Node) => {
    alert(node.path)
  };

  async function readEntry(
    entry: FileSystemEntry,
    path = "",
  ): Promise<UploadFile[]> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;

      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });

      return [
        {
          file,
          relativePath: path + file.name,
        },
      ];
    }

    if (entry.isDirectory) {
      const directoryEntry = entry as FileSystemDirectoryEntry;
      const reader = directoryEntry.createReader();

      const entries = await new Promise<FileSystemEntry[]>(
        (resolve, reject) => {
          reader.readEntries(resolve, reject);
        },
      );

      const files: UploadFile[] = [];

      for (const child of entries) {
        const childFiles = await readEntry(
          child,
          path + entry.name + "/",
        );

        files.push(...childFiles);
      }

      return files;
    }

    return [];
  }

  const handleDrop = async (
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();

    const uploadFiles: UploadFile[] = [];

    for (const item of Array.from(event.dataTransfer.items)) {
      const entry = item.webkitGetAsEntry();

      if (!entry) {
        continue;
      }

      const files = await readEntry(entry);

      uploadFiles.push(...files);
    }

    if (uploadFiles.length === 0) {
      return;
    }

    console.log(uploadFiles);

    await uploadNode(
      uploadFiles,
      currentPath,
    );

    await reload();
  };

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
    <div 
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={handleDrop}>
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

              onDoubleClick={() => {
                if (row.original.nodeType === NodeType.Folder) {
                  onOpenFolder(row.original.path);
                  return;
                }

                if (row.original.nodeType === NodeType.File) {
                  handleOpen(row.original);
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
    </div>
  );
}

export default NodeTable;
