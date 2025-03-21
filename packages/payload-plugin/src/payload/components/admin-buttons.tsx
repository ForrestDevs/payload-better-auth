'use client'

import React, { CSSProperties, useEffect, useState } from 'react'
import { adminClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Toaster } from 'sonner'
import { Button } from '@payloadcms/ui'
import './styles.css'

import '@payloadcms/ui/styles.css'

async function getDocumentData(id: string, path: string) {
  const apiUrl = `${path}/api`
  try {
    // Try to load the /api page and parse the HTML response
    const response = await fetch(apiUrl)
    if (response.ok) {
      const htmlResponse = await response.text()
      // Parse the HTML to extract user data
      try {
        let documentData: any = null
        const parser = new DOMParser()
        const doc = parser.parseFromString(htmlResponse, 'text/html')

        // Look for the JSON data in the query inspector
        const jsonRows = doc.querySelectorAll('.query-inspector__row-line')
        if (jsonRows.length > 0) {
          documentData = {}

          jsonRows.forEach((row) => {
            const keyMatch = row.innerHTML.match(/"([^"]+)"\s*:/)
            if (keyMatch) {
              const key = keyMatch[1].trim()
              const valueElement = row.querySelector('.query-inspector__value')
              if (valueElement) {
                let value = valueElement.textContent?.trim() ?? ''

                // Convert values to appropriate types
                if (value === 'true') value = 'true'
                else if (value === 'false') value = 'false'
                else if (value === 'null') value = 'null'
                else if (!isNaN(Number(value))) value = Number(value).toString()
                else if (value.startsWith('"') && value.endsWith('"')) {
                  value = value.substring(1, value.length - 1).trim()
                }

                documentData[key] = value
              }
            }
          })
        }

        return documentData
      } catch (parseError) {
        console.error('Error parsing document data from HTML:', parseError)
        return null
      }
    }
  } catch (apiError) {
    console.error('Error fetching document data from API:', apiError)
  }
}

export default function AdminButtons({ userSlug }: { userSlug: string }) {
  const router = useRouter()
  const path = usePathname()
  const params = useParams()
  const [id, setId] = useState('')
  const [documentData, setDocumentData] = useState<any>(null)

  const authClient = createAuthClient({
    plugins: [adminClient()],
  })

  useEffect(() => {
    async function fetchDocumentData() {
      // Get the ID from the params.segments array
      const segments = params.segments as string[]
      const userSlugIndex = segments.findIndex((segment) => segment === userSlug)
      const id =
        userSlugIndex !== -1 && userSlugIndex < segments.length - 1
          ? segments[userSlugIndex + 1]
          : segments[segments.length - 1]

      const documentData = await getDocumentData(id, path)
      setId(id)
      setDocumentData(documentData)
    }
    fetchDocumentData()
  }, [params, path, userSlug])

  const handleImpersonate = async () => {
    await authClient.admin.impersonateUser({
      userId: id,
      fetchOptions: {
        onSuccess() {
          router.push('/')
        },
        onError(error: any) {
          console.error('Error impersonating user:', error)
          toast.error('Failed to impersonate user')
        },
      },
    })
  }

  const handleBan = async () => {
    await authClient.admin.banUser({
      userId: id,
      fetchOptions: {
        onSuccess() {
          toast.success('User banned successfully')
          router.refresh()
        },
        onError(error: any) {
          console.error('Error banning user:', error)
          toast.error('Failed to ban user')
        },
      },
    })
  }

  const handleUnban = async () => {
    await authClient.admin.unbanUser({
      userId: id,
      fetchOptions: {
        onSuccess() {
          toast.success('User unbanned successfully')
          router.refresh()
        },
        onError(error: any) {
          console.error('Error unbanning user:', error)
          toast.error('Failed to unban user')
        },
      },
    })
  }

  const handleRevokeAllSessions = async () => {
    await authClient.admin.revokeUserSessions({
      userId: id,
      fetchOptions: {
        onSuccess() {
          toast.success('All sessions revoked successfully')
          router.refresh()
        },
        onError(error: any) {
          console.error('Error revoking all sessions:', error)
          toast.error('Failed to revoke all sessions')
        },
      },
    })
  }

  return (
    <>
      <style>{`
        .admin-actions-container {
          display: flex;
          flex-direction: column;
        }
        .admin-actions-container h3 {
          margin-bottom: 1rem;
        }
        .admin-actions-container .btn {
          margin-block: 0.5rem;
        }
        .ban-button {
          background-color: oklch(0.258 0.092 26.042);
          color: oklch(0.577 0.245 27.325);
          border: 1px solid oklch(0.396 0.141 25.723);
          &:hover {
            color: #fff;
            background-color: oklch(0.505 0.213 27.518);
          }
        }
        .revoke-sessions-button {
          --theme-elevation-800: oklch(0.396 0.141 25.723);
          color: oklch(0.637 0.237 25.331);
          &:hover {
            --theme-elevation-400: oklch(0.396 0.141 25.723);
            color: #fff;
            background-color: oklch(0.396 0.141 25.723);
          }
        }
      `}</style>
      <div className="admin-actions-container">
        <h3>Admin Actions</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: '0.5rem' }}>
          <Button onClick={handleImpersonate} buttonStyle="primary">
            Impersonate
          </Button>
          <Button
            onClick={handleRevokeAllSessions}
            buttonStyle="secondary"
            className="revoke-sessions-button"
          >
            Revoke All Sessions
          </Button>
          <Button onClick={handleBan} buttonStyle="error" className="ban-button">
            Ban
          </Button>
          <Button onClick={handleUnban} buttonStyle="primary">
            Unban
          </Button>
        </div>
      </div>
      <Toaster />
    </>
  )
}
