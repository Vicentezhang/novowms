import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from './pages/Login';
import Layout from './components/Layout';
import { useAuthStore } from './store/authStore';

// Import Pages
import Inventory from './pages/Inventory';
import Receive from './pages/Receive';
import Clients from './pages/Clients';
import Count from './pages/Count';
import Users from './pages/Users';
import Inspect from './pages/Inspect';
import Products from './pages/Products';
import Outbound from './pages/Outbound';
import Finance from './pages/Finance'; 
// If Inbound page is not ready, keep it commented out or create a simple placeholder
import Inbound from './pages/Inbound'; 

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes cache
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, session } = useAuthStore();
  const location = useLocation();

  // Backward compatibility: Check user object (from localStorage) OR session
  if (!user && !session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/inventory" replace />} />
            
            <Route path="receive" element={<Receive />} />
            <Route path="inbound" element={<Inbound />} />
            <Route path="count" element={<Count />} />
            <Route path="inspect" element={<Inspect />} />
            <Route path="inventory" element={<Inventory />} />
            
            <Route path="outbound" element={<Outbound />} />
            <Route path="products" element={<Products />} />
            <Route path="finance" element={<Finance />} />
            
            <Route path="clients" element={<Clients />} />
            <Route path="users" element={<Users />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}