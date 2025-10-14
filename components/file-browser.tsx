'use client'

import { useState, useEffect, useCallback } from 'react'
import { File, Folder, FolderOpen, Clock, GitBranch, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAtom } from 'jotai'
import { getTaskFileBrowserState } from '@/lib/atoms/file-browser'
import { useMemo } from 'react'

interface FileChange {
  filename: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  changes: number
}

interface FileTreeNode {
  type: 'file' | 'directory'
  filename?: string
  status?: string
  additions?: number
  deletions?: number
  changes?: number
  children?: { [key: string]: FileTreeNode }
}

interface FileBrowserProps {
  taskId: string
  branchName?: string | null
  onFileSelect?: (filename: string) => void
  onFilesLoaded?: (filenames: string[]) => void
  selectedFile?: string
  refreshKey?: number
  viewMode?: 'changes' | 'all'
  onViewModeChange?: (mode: 'changes' | 'all') => void
  hideHeader?: boolean
}

export function FileBrowser({
  taskId,
  branchName,
  onFileSelect,
  onFilesLoaded,
  selectedFile,
  refreshKey,
  viewMode = 'changes',
  onViewModeChange,
  hideHeader = false,
}: FileBrowserProps) {
  // Use Jotai atom for state management
  const taskStateAtom = useMemo(() => getTaskFileBrowserState(taskId), [taskId])
  const [state, setState] = useAtom(taskStateAtom)

  // Get current viewMode data
  const currentViewData = state[viewMode]
  const { files, fileTree, expandedFolders, fetchAttempted } = currentViewData
  const { loading, error } = state

  // Helper function to recursively collect all folder paths
  const getAllFolderPaths = useCallback(function collectPaths(
    tree: { [key: string]: FileTreeNode },
    basePath = '',
  ): string[] {
    const paths: string[] = []

    Object.entries(tree).forEach(([name, node]) => {
      const fullPath = basePath ? `${basePath}/${name}` : name

      if (node.type === 'directory') {
        paths.push(fullPath)
        if (node.children) {
          paths.push(...collectPaths(node.children, fullPath))
        }
      }
    })

    return paths
  }, [])

  const fetchBranchFiles = useCallback(async () => {
    if (!branchName) return

    setState({ loading: true, error: null })

    try {
      const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
      const response = await fetch(url)
      const result = await response.json()

      if (result.success) {
        const fetchedFiles = result.files || []
        const fetchedFileTree = result.fileTree || {}

        // In "changes" mode, expand all folders by default
        // In "all" mode, collapse all folders by default
        const newExpandedFolders =
          viewMode === 'changes' ? new Set(getAllFolderPaths(fetchedFileTree)) : new Set<string>()

        // Update the specific viewMode data
        setState({
          [viewMode]: {
            files: fetchedFiles,
            fileTree: fetchedFileTree,
            expandedFolders: newExpandedFolders,
            fetchAttempted: true,
          },
          loading: false,
          error: null,
        })

        // Notify parent component with list of filenames
        if (onFilesLoaded && fetchedFiles.length > 0) {
          onFilesLoaded(fetchedFiles.map((f: FileChange) => f.filename))
        }
      } else {
        setState({
          [viewMode]: {
            files: [],
            fileTree: {},
            expandedFolders: new Set<string>(),
            fetchAttempted: true,
          },
          loading: false,
          error: result.error || 'Failed to fetch files',
        })
      }
    } catch (err) {
      setState({
        [viewMode]: {
          files: [],
          fileTree: {},
          expandedFolders: new Set<string>(),
          fetchAttempted: true,
        },
        loading: false,
        error: 'Failed to fetch branch files',
      })
    }
  }, [branchName, taskId, onFilesLoaded, viewMode, setState, getAllFolderPaths])

  useEffect(() => {
    // Only fetch if we don't have files for this viewMode yet AND haven't attempted to fetch
    if (branchName && files.length === 0 && !loading && !fetchAttempted) {
      fetchBranchFiles()
    }
  }, [branchName, files.length, loading, fetchAttempted, fetchBranchFiles])

  // Separate effect for refreshKey to force refetch
  useEffect(() => {
    if (branchName && refreshKey !== undefined && refreshKey > 0) {
      // Reset fetchAttempted flag to allow refetch
      setState({
        [viewMode]: {
          ...currentViewData,
          fetchAttempted: false,
        },
      })
      fetchBranchFiles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, branchName])

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    // Update only the current viewMode's expanded folders
    setState({
      [viewMode]: {
        ...currentViewData,
        expandedFolders: newExpanded,
      },
    })
  }

  const renderFileTree = (tree: { [key: string]: FileTreeNode }, path = '') => {
    // Sort entries: directories first, then files, both alphabetically
    const sortedEntries = Object.entries(tree).sort(([nameA, nodeA], [nameB, nodeB]) => {
      // If one is a directory and the other is a file, directory comes first
      if (nodeA.type === 'directory' && nodeB.type === 'file') return -1
      if (nodeA.type === 'file' && nodeB.type === 'directory') return 1
      // If both are the same type, sort alphabetically (case-insensitive)
      return nameA.toLowerCase().localeCompare(nameB.toLowerCase())
    })

    return sortedEntries.map(([name, node]) => {
      const fullPath = path ? `${path}/${name}` : name

      if (node.type === 'directory') {
        const isExpanded = expandedFolders.has(fullPath)
        return (
          <div key={fullPath}>
            <div
              className="flex items-center gap-2 px-2 md:px-3 py-1.5 hover:bg-card/50 cursor-pointer rounded-sm"
              onClick={() => toggleFolder(fullPath)}
            >
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500 flex-shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500 flex-shrink-0" />
              )}
              <span className="text-xs md:text-sm font-medium truncate">{name}</span>
            </div>
            {isExpanded && node.children && (
              <div className="ml-3 md:ml-4">{renderFileTree(node.children, fullPath)}</div>
            )}
          </div>
        )
      } else {
        // File node
        const isSelected = selectedFile === node.filename
        return (
          <div
            key={fullPath}
            className={`flex items-center gap-2 px-2 md:px-3 py-1.5 cursor-pointer rounded-sm ${
              isSelected ? 'bg-card' : 'hover:bg-card/50'
            }`}
            onClick={() => onFileSelect?.(node.filename!)}
          >
            <File className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs md:text-sm flex-1 truncate">{name}</span>
            {viewMode === 'changes' && (node.additions || node.deletions) && (
              <div className="flex items-center gap-1 text-xs flex-shrink-0">
                {node.additions && node.additions > 0 && <span className="text-green-600">+{node.additions}</span>}
                {node.deletions && node.deletions > 0 && <span className="text-red-600">-{node.deletions}</span>}
              </div>
            )}
          </div>
        )
      }
    })
  }

  if (!branchName) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 md:p-4 border-b">
          <h3 className="text-base md:text-lg font-semibold">Files</h3>
          <p className="text-xs md:text-sm text-muted-foreground">Task in progress</p>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 md:p-6">
          <div className="text-center space-y-3 md:space-y-4">
            <div className="flex justify-center">
              <div className="flex items-center gap-2 text-amber-500">
                <Clock className="w-5 h-5 md:w-6 md:h-6" />
                <GitBranch className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm md:text-base font-medium">Branch Not Created Yet</h4>
              <p className="text-xs md:text-sm text-muted-foreground max-w-xs px-2 md:px-0">
                The coding agent is still working on this task. File changes will appear here once the agent creates a
                branch.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">Check the logs for progress updates</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {!hideHeader && (
        <div className="px-2 py-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold pl-1">Files</h3>
          <div className="inline-flex rounded-md border border-border bg-muted/50 p-0.5">
            <Button
              variant={viewMode === 'changes' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange?.('changes')}
              className={`h-6 px-2 text-xs rounded-sm ${
                viewMode === 'changes' ? 'bg-background shadow-sm' : 'hover:bg-transparent hover:text-foreground'
              }`}
            >
              Changes
            </Button>
            <Button
              variant={viewMode === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange?.('all')}
              className={`h-6 px-2 text-xs rounded-sm ${
                viewMode === 'all' ? 'bg-background shadow-sm' : 'hover:bg-transparent hover:text-foreground'
              }`}
            >
              All Files
            </Button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 md:p-4 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-3 md:p-4 text-center text-xs md:text-sm text-destructive">{error}</div>
        ) : files.length === 0 ? (
          <div className="p-3 md:p-4 text-center text-xs md:text-sm text-muted-foreground">
            {viewMode === 'changes' ? 'No files changed' : 'No files found'}
          </div>
        ) : (
          <div className="py-2">{renderFileTree(fileTree)}</div>
        )}
      </div>
    </div>
  )
}
