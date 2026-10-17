import { createContext, useContext } from 'react'

// Shared by NotificationsProvider (the state) and the bell / panel (the readers); a separate file so the provider
// and the panel it renders do not import each other.
export const NotificationsContext = createContext(null)

export const useNotifications = () => useContext(NotificationsContext)
