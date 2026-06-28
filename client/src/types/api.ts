// Shared API envelope types: server pagination wrapper + the error shape parsed by parseApiError.
export interface PaginatedResult<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface ApiError {
  error?: string
  title?: string
  status?: number
  errors?: Record<string, string[]>
}
