import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { router } from './router.jsx';
import './styles.css';

createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Toaster richColors position="top-center" />
  </React.StrictMode>,
);
