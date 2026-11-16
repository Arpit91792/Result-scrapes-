import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
      defaultOptions: {
            queries: {
                  staleTime: 30000,
                  retry: 1,
            },
      },
});

ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
            <QueryClientProvider client={queryClient}>
                  <BrowserRouter>
                        <App />
                        <Toaster
                              position="top-right"
                              toastOptions={{
                                    duration: 4000,
                                    style: { background: '#1E3A5F', color: '#fff', borderRadius: '8px' },
                                    success: { style: { background: '#065F46', color: '#fff' } },
                                    error: { style: { background: '#7F1D1D', color: '#fff' } },
                              }}
                        />
                  </BrowserRouter>
            </QueryClientProvider>
      </React.StrictMode>
);
