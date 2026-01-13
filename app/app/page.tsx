'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCooldownTime, isDateExpired, formatDate } from '@/lib/utils'

interface UserInfo {
  keyId: string
  keyMask: string
  isActive: boolean
  expiresAt: string
  lastTokenAt: string | null
  assignedCount: number
  nextAvailableAt: string | null
}

interface TokenResult {
  token: string
  createdAt: string
  nextAvailableAt: string | null
}

interface ApiError {
  error: string
  message?: string
  details?: any
}

interface Notice {
  content: string
  displayMode: 'modal' | 'sidebar' | 'both'
  isActive: boolean
  updatedAt?: string
}

export default function AppPage() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number>(0)
  const [copySuccess, setCopySuccess] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [showNotice, setShowNotice] = useState<boolean>(false)
  const router = useRouter()

  // Fetch user info on mount
  useEffect(() => {
    fetchUserInfo()
    fetchNotice()
  }, [])

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1000), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  // Update countdown when userInfo changes
  useEffect(() => {
    if (userInfo?.nextAvailableAt) {
      const nextTime = new Date(userInfo.nextAvailableAt).getTime()
      const now = Date.now()
      const remaining = Math.max(0, nextTime - now)
      setCountdown(remaining)
    } else {
      setCountdown(0)
    }
  }, [userInfo])

  const fetchUserInfo = async () => {
    try {
      const response = await fetch('/api/me', {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUserInfo(data.data)
      } else {
        router.push('/login')
      }
    } catch (err) {
      setError('Không thể tải thông tin người dùng')
    } finally {
      setLoading(false)
    }
  }

  const fetchNotice = async () => {
    try {
      const response = await fetch('/api/notice', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      if (response.ok) {
        const data = await response.json()
        if (data?.data && data.data.isActive) {
          setNotice(data.data)
          setShowNotice(true)
        } else {
          setNotice(null)
        }
      }
    } catch (e) {
      // ignore errors
    }
  }

  const handleGetToken = async () => {
    setTokenLoading(true)
    setError(null)
    setToken(null)

    try {
      const response = await fetch('/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      })

      const data = await response.json()

      if (response.ok && data.data) {
        setToken(data.data.token)
        // Update user info to reflect new nextAvailableAt
        await fetchUserInfo()
      } else {
        const apiError = data as ApiError
        if (response.status === 429) {
          // Rate limited
          setError('Bạn đang trong thời gian chờ. Vui lòng đợi hết thời gian cooldown.')
          if (apiError.details?.blockedUntil) {
            const blockedUntil = new Date(apiError.details.blockedUntil).getTime()
            const now = Date.now()
            setCountdown(Math.max(0, blockedUntil - now))
          }
        } else if (response.status === 409 && apiError.error === 'OUT_OF_STOCK') {
          setError('Hết token trong kho. Vui lòng quay lại sau.')
        } else {
          setError(apiError.message || 'Không thể lấy token. Vui lòng thử lại.')
        }
      }
    } catch (err) {
      setError('Có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setTokenLoading(false)
    }
  }

  const handleCopyToken = async () => {
    if (!token) return

    try {
      await navigator.clipboard.writeText(token)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      setError('Không thể copy token. Vui lòng copy thủ công.')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      })
      router.push('/login')
    } catch (err) {
      // Still redirect on error
      router.push('/login')
    }
  }

  const canGetToken = () => {
    if (!userInfo) return false
    if (!userInfo.isActive) return false
    if (isDateExpired(userInfo.expiresAt)) return false
    if (countdown > 0) return false
    return true
  }

  const getKeyStatus = () => {
    if (!userInfo) return ''
    
    if (!userInfo.isActive) {
      return 'Key đã bị vô hiệu hóa'
    }
    
    if (isDateExpired(userInfo.expiresAt)) {
      return `Key đã hết hạn (${formatDate(userInfo.expiresAt)})`
    }
    
    return `Key còn hạn đến ${formatDate(userInfo.expiresAt)}`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Sidebar notice card (if configured) */}
      {notice && (notice.displayMode === 'sidebar' || notice.displayMode === 'both') && notice.isActive && (
        <>
          <div className="hidden lg:block fixed top-24 left-6 w-80 z-30">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow">
              <div className="flex items-start">
                <div className="text-yellow-600 mr-2">⚠️</div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{notice.content}</div>
              </div>
            </div>
          </div>
          <div className="hidden lg:block fixed top-24 right-6 w-80 z-30">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow">
              <div className="flex items-start">
                <div className="text-yellow-600 mr-2">⚠️</div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{notice.content}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Pop-up modal notice */}
      {notice && (notice.displayMode === 'modal' || notice.displayMode === 'both') && showNotice && notice.isActive && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Thông báo</h3>
              <button onClick={() => setShowNotice(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="p-4">
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{notice.content}</div>
            </div>
            <div className="p-4 border-t flex justify-end">
              <button className="btn-primary" onClick={() => setShowNotice(false)}>Đã hiểu</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* User Info Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Thông tin tài khoản</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Key ID</label>
              <p className="text-sm text-gray-600 font-mono">{userInfo?.keyMask}</p>
            </div>
            
            <div>
              <label className="form-label">Trạng thái</label>
              <p className={`text-sm ${
                userInfo?.isActive && !isDateExpired(userInfo.expiresAt) 
                  ? 'text-green-600' 
                  : 'text-red-600'
              }`}>
                {getKeyStatus()}
              </p>
            </div>
            
            <div>
              <label className="form-label">Số token đã nhận</label>
              <p className="text-sm text-gray-600">{userInfo?.assignedCount || 0}</p>
            </div>
            
            <div>
              <label className="form-label">Lần lấy token cuối</label>
              <p className="text-sm text-gray-600">
                {userInfo?.lastTokenAt ? formatDate(userInfo.lastTokenAt) : 'Chưa từng lấy'}
              </p>
            </div>
          </div>
        </div>

        {/* Token Generation Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Lấy Token</h2>
          </div>

          <div className="space-y-4">
            {/* Get Token Button */}
            <div>
              <button
                onClick={handleGetToken}
                disabled={!canGetToken() || tokenLoading}
                className={`w-full ${
                  canGetToken() && !tokenLoading
                    ? 'btn-primary'
                    : 'btn-disabled'
                }`}
              >
                {tokenLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="spinner mr-2"></div>
                    Đang tạo token...
                  </div>
                ) : countdown > 0 ? (
                  `Chờ ${formatCooldownTime(countdown)} nữa`
                ) : (
                  'Lấy Token'
                )}
              </button>
            </div>

            {/* Countdown Display */}
            {countdown > 0 && (
              <div className="warning-state rounded-lg p-3 border">
                <p className="text-sm">
                  Bạn cần chờ <strong>{formatCooldownTime(countdown)}</strong> nữa mới có thể lấy token tiếp theo.
                </p>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="error-state rounded-lg p-3 border">
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Token Display */}
            {token && (
              <div className="space-y-3">
                <label className="form-label">Token của bạn:</label>
                <div className="token-display" tabIndex={0}>
                  {token}
                </div>
                <button
                  onClick={handleCopyToken}
                  className={copySuccess ? 'btn-success' : 'btn-secondary'}
                >
                  {copySuccess ? '✓ Đã copy!' : 'Copy Token'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <button
            onClick={handleLogout}
            className="btn-secondary"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  )
}
