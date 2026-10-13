"use client"

/* eslint-disable @next/next/no-img-element */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AudioLines,
  CheckSquare,
  Download,
  FolderClosed,
  FolderPlus,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Plus,
  Sparkle,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react"

import {
  createProjectAction,
  deleteProjectAction,
  listProjectsAction,
  renameProjectAction,
} from "@/app/actions/projects"
import {
  ConfirmDialog,
  ProjectPickerDialog,
  useTileActions,
} from "@/components/generator/tile-actions"
import { useToast } from "@/components/providers/app-providers"
import {
  ProjectActions,
  ProjectCreateModal,
} from "@/components/studio/project-dialogs"
import { UserGenerations } from "@/components/studio/user-generations"
import { activeSurfaces } from "@/generation/catalog"
import type { ProjectView, UploadView } from "@/lib/generations/view"
import { downloadMedia } from "@/lib/studio/download-media"
import { runToGalleryItems } from "@/lib/studio/gallery-items"
import { useUploads } from "@/lib/studio/uploads"
import { useRuns } from "@/lib/studio/use-runs"
import { cn } from "@/lib/utils"

type Filter = "all" | "image" | "video" | "audio" | "uploads"

export function LibraryView({
  initialProjects,
  project,
  initialFilter = "all",
}: {
  initialProjects: ProjectView[]
  project?: ProjectView
  initialFilter?: Filter
}) {
  const router = useRouter()
  const toast = useToast()
  const [projects, setProjects] = useState(initialProjects)
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moveIds, setMoveIds] = useState<string[] | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const runs = useRuns({ ...(project ? { projectId: project.id } : {}) })
  const reloadProjects = useCallback(async () => {
    const result = await listProjectsAction()
    if (result.ok) setProjects(result.data)
  }, [])
  const { actions, dialogs } = useTileActions({
    runs,
    onChanged: () => void reloadProjects(),
  })

  const surfaces = activeSurfaces()
  const filters: { id: Filter; label: string; icon: typeof ImageIcon }[] = [
    { id: "all", label: "All", icon: LayoutGrid },
    { id: "image", label: "Images", icon: ImageIcon },
    { id: "video", label: "Videos", icon: Video },
    ...(surfaces.includes("audio")
      ? [{ id: "audio" as const, label: "Audio", icon: AudioLines }]
      : []),
    ...(project
      ? []
      : [{ id: "uploads" as const, label: "Uploads", icon: Upload }]),
  ]

  const items = useMemo(
    () =>
      runs.records
        .filter(
          (run) =>
            filter === "all" || filter === "uploads" || run.surface === filter
        )
        .flatMap(runToGalleryItems),
    [filter, runs.records]
  )
  const selectedRuns = runs.records.filter((run) => selected.has(run.id))

  const toggle = (runId: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(runId)) next.delete(runId)
      else next.add(runId)
      return next
    })
  const endSelection = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const bulkDownload = async () => {
    setBusy(true)
    for (const run of selectedRuns.slice(0, 30))
      for (const output of run.outputs) await downloadMedia(output.url)
    setBusy(false)
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 md:flex-row md:p-4 md:pt-2">
      <aside
        aria-label="Library navigation"
        className="studio-backdrop flex shrink-0 flex-col gap-4 rounded-[20px] border border-hairline p-3 md:w-[240px] md:overflow-y-auto"
      >
        <nav className="flex gap-1 md:flex-col">
          <Link
            href="/assets"
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              !project
                ? "bg-white/5 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="size-4" /> All generations
          </Link>
        </nav>
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Projects
          </span>
          <ProjectCreateModal
            trigger={
              <button
                type="button"
                aria-label="New project"
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            }
            onCreate={async (name) => {
              const result = await createProjectAction(name)
              if (!result.ok)
                return toast.error("Couldn't create project", result.error)
              await reloadProjects()
              router.push(`/projects/${result.data.id}`)
            }}
          />
        </div>
        <ul className="-mt-2 flex scrollbar-none gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {projects.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              No projects yet. Create one to group generations.
            </li>
          ) : (
            projects.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "group flex shrink-0 items-center gap-2 rounded-lg pr-1",
                  project?.id === item.id
                    ? "bg-white/5"
                    : "hover:bg-white/[0.03]"
                )}
              >
                <Link
                  href={`/projects/${item.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm"
                  aria-current={project?.id === item.id ? "page" : undefined}
                >
                  {item.cover ? (
                    <img
                      src={item.cover}
                      alt=""
                      className="size-6 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <FolderClosed className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{item.name}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {item.generationCount}
                  </span>
                </Link>
                <ProjectActions
                  projectName={item.name}
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  onRename={async (name) => {
                    const result = await renameProjectAction(item.id, name)
                    if (!result.ok)
                      return toast.error("Couldn't rename", result.error)
                    await reloadProjects()
                    router.refresh()
                  }}
                  onDelete={async () => {
                    const result = await deleteProjectAction(item.id)
                    if (!result.ok)
                      return toast.error("Couldn't delete", result.error)
                    await reloadProjects()
                    if (project?.id === item.id) router.push("/assets")
                  }}
                />
              </li>
            ))
          )}
        </ul>
      </aside>

      <section
        aria-label={project ? project.name : "Library"}
        className="flex min-h-[70vh] min-w-0 flex-1 flex-col gap-3 overflow-hidden rounded-[20px] border border-white/10 p-3 md:min-h-0"
      >
        <header className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 flex items-center gap-2 text-xl font-medium">
            <FolderClosed className="size-5 text-lime" />
            {project ? project.name : "Library"}
          </h1>
          <div
            className="flex scrollbar-none gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Filter"
          >
            {filters.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => {
                  setFilter(id)
                  endSelection()
                }}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold",
                  filter === id
                    ? "bg-hover text-foreground"
                    : "bg-surface text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          {filter !== "uploads" ? (
            <button
              type="button"
              onClick={() => (selecting ? endSelection() : setSelecting(true))}
              aria-pressed={selecting}
              className="ml-auto flex h-9 items-center gap-1.5 rounded-[10px] bg-surface px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              {selecting ? (
                <X className="size-4" />
              ) : (
                <CheckSquare className="size-4" />
              )}
              {selecting ? "Done" : "Select"}
            </button>
          ) : null}
        </header>

        {selecting ? (
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-2"
            role="toolbar"
            aria-label="Selection actions"
          >
            <span className="px-2 text-sm">{selected.size} selected</span>
            <button
              type="button"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              onClick={() =>
                setSelected(new Set(runs.records.map((run) => run.id)))
              }
            >
              Select all
            </button>
            <BulkButton
              icon={Download}
              label="Download"
              disabled={!selected.size || busy}
              onClick={() => void bulkDownload()}
            />
            <BulkButton
              icon={FolderPlus}
              label="Move to project"
              disabled={!selected.size || busy}
              onClick={() => setMoveIds([...selected])}
            />
            <BulkButton
              icon={Trash2}
              label="Delete"
              danger
              disabled={!selected.size || busy}
              onClick={() => setConfirmDelete(true)}
            />
            {busy ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        ) : null}

        {filter === "uploads" ? (
          <UploadsGrid />
        ) : (
          <UserGenerations
            items={items}
            showHeader={!selecting}
            title={null}
            hasMore={runs.hasMore}
            loadingMore={runs.loadingMore}
            onLoadMore={runs.loadMore}
            actions={selecting ? undefined : actions}
            selection={
              selecting
                ? { selected, onToggle: (item) => toggle(item.runId) }
                : undefined
            }
            emptyState={
              !runs.loaded ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" /> Loading your
                  library…
                </div>
              ) : (
                <EmptyLibrary project={Boolean(project)} />
              )
            }
          />
        )}
      </section>

      {dialogs}
      <ProjectPickerDialog
        runIds={moveIds}
        onClose={() => setMoveIds(null)}
        onMoved={(name) => {
          toast.success(name ? `Moved to ${name}` : "Removed from project")
          void reloadProjects()
          endSelection()
          router.refresh()
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${selected.size} generation${selected.size === 1 ? "" : "s"}?`}
        description="Their media is removed from your library and storage. This can't be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const ok = await runs.remove([...selected])
          setConfirmDelete(false)
          if (ok) {
            toast.success("Deleted")
            endSelection()
            void reloadProjects()
          }
        }}
      />
    </div>
  )
}

function BulkButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: typeof Download
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-xs font-medium hover:bg-white/10 disabled:opacity-40",
        danger && "text-[#ff6b6b]"
      )}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  )
}

function EmptyLibrary({ project }: { project: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-lime/10">
        <FolderClosed className="size-7 text-lime" />
      </span>
      <p className="text-base font-semibold">
        {project
          ? "This project is empty."
          : "Your creations will appear here."}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {project
          ? "Open any generation's menu and choose Add to project."
          : "Everything you generate is saved to your library — images, videos and uploads."}
      </p>
      <Link
        href="/video"
        className="mt-2 flex h-10 items-center gap-1.5 rounded-[10px] bg-raised px-4 text-sm font-medium hover:bg-hover"
      >
        <Sparkle className="size-4 fill-lime text-lime" /> Generate
      </Link>
    </div>
  )
}

function UploadsGrid() {
  const uploads = useUploads((state) => state.uploads)
  const loaded = useUploads((state) => state.loaded)
  const load = useUploads((state) => state.load)
  const remove = useUploads((state) => state.remove)
  const toast = useToast()
  const [pendingDelete, setPendingDelete] = useState<UploadView | null>(null)
  useEffect(() => {
    void load(true)
  }, [load])
  if (!loaded)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading uploads…
      </div>
    )
  if (!uploads.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <Upload className="size-8 text-muted-foreground" />
        <p className="font-semibold">No uploads yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Files you attach as references in the generator are kept here so you
          can reuse them.
        </p>
      </div>
    )
  return (
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-5">
      {uploads.map((upload) => (
        <figure
          key={upload.id}
          className="group relative overflow-hidden rounded-xl bg-surface"
        >
          <div className="aspect-square">
            {upload.kind === "image" ? (
              <img
                src={upload.url}
                alt={upload.name}
                loading="lazy"
                className="size-full object-cover"
              />
            ) : upload.kind === "video" ? (
              <video
                src={upload.url}
                muted
                playsInline
                preload="metadata"
                className="size-full object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center">
                <AudioLines className="size-8 text-lime" />
              </span>
            )}
          </div>
          <figcaption className="truncate px-2 py-1.5 text-xs text-muted-foreground">
            {upload.name}
          </figcaption>
          <div className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            <button
              type="button"
              aria-label={`Download ${upload.name}`}
              onClick={() => void downloadMedia(upload.url, upload.name)}
              className="flex size-8 items-center justify-center rounded-full bg-black/50 backdrop-blur"
            >
              <Download className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${upload.name}`}
              onClick={() => setPendingDelete(upload)}
              className="flex size-8 items-center justify-center rounded-full bg-black/50 text-[#ff6b6b] backdrop-blur"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </figure>
      ))}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this upload?"
        description="Generations that already used it keep their results."
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return
          try {
            await remove(pendingDelete.id)
            toast.success("Upload deleted")
          } catch (error) {
            toast.error(
              "Couldn't delete",
              error instanceof Error ? error.message : undefined
            )
          }
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
