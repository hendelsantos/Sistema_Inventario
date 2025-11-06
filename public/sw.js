const CACHE_NAME = 'inventario-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Assets essenciais para cache
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/offline.html',
  // Bibliotecas externas essenciais
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// URLs da API para cache dinâmico
const API_CACHE_URLS = [
  '/api/inventory',
  '/api/inventory/search',
  '/api/inventory/stats'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Static assets cached');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// Ativar Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Interceptar requisições (estratégia Cache First para static, Network First para API)
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requisições não-GET
  if (request.method !== 'GET') {
    return;
  }

  // Estratégia para arquivos estáticos: Cache First
  if (STATIC_CACHE_URLS.some(cachedUrl => url.pathname === cachedUrl || url.href === cachedUrl)) {
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            console.log('[SW] Serving from cache:', url.pathname);
            return response;
          }
          return fetch(request)
            .then(fetchResponse => {
              const responseClone = fetchResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(request, responseClone));
              return fetchResponse;
            });
        })
        .catch(() => {
          // Se for a página principal e não conseguir carregar, mostrar offline
          if (url.pathname === '/' || url.pathname === '/index.html') {
            return caches.match(OFFLINE_URL);
          }
        })
    );
    return;
  }

  // Estratégia para API: Network First com fallback para cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Se a resposta for bem-sucedida, cache ela
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(request, responseClone);
              });
          }
          return response;
        })
        .catch(() => {
          // Se falhar na rede, tentar buscar no cache
          console.log('[SW] Network failed, trying cache for:', url.pathname);
          return caches.match(request)
            .then(cachedResponse => {
              if (cachedResponse) {
                // Adicionar header para indicar que está offline
                const response = cachedResponse.clone();
                response.headers.set('X-Served-By', 'sw-cache');
                return response;
              }
              // Se não tiver no cache, retornar resposta de erro estruturada
              return new Response(
                JSON.stringify({
                  error: 'Offline',
                  message: 'Dados não disponíveis offline',
                  offline: true
                }),
                {
                  status: 503,
                  statusText: 'Service Unavailable',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Served-By': 'sw-offline'
                  }
                }
              );
            });
        })
    );
    return;
  }

  // Para outras requisições, tentar rede primeiro
  event.respondWith(
    fetch(request)
      .catch(() => {
        // Se for HTML, mostrar página offline
        if (request.headers.get('Accept').includes('text/html')) {
          return caches.match(OFFLINE_URL);
        }
      })
  );
});

// Sincronização em background
self.addEventListener('sync', event => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'background-sync-inventory') {
    event.waitUntil(
      syncInventoryData()
    );
  }
});

// Função para sincronizar dados quando voltar online
async function syncInventoryData() {
  try {
    console.log('[SW] Starting background sync...');
    
    // Verificar se há dados pendentes no IndexedDB
    const pendingData = await getPendingData();
    
    if (pendingData.length > 0) {
      console.log('[SW] Found pending data to sync:', pendingData.length, 'items');
      
      for (const item of pendingData) {
        try {
          // Tentar enviar cada item pendente
          const response = await fetch('/api/inventory', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(item.data)
          });
          
          if (response.ok) {
            // Se enviou com sucesso, remover da lista pendente
            await removePendingData(item.id);
            console.log('[SW] Synced item:', item.id);
          }
        } catch (error) {
          console.error('[SW] Failed to sync item:', item.id, error);
        }
      }
      
      // Notificar as abas abertas sobre a sincronização
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_COMPLETE',
          syncedCount: pendingData.length
        });
      });
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Funções auxiliares para IndexedDB (dados offline)
async function getPendingData() {
  // Implementação simplificada - na prática usaria IndexedDB
  return [];
}

async function removePendingData(id) {
  // Implementação simplificada - na prática removeria do IndexedDB
  console.log('[SW] Removing pending data:', id);
}

// Atualização do Service Worker
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received skip waiting message');
    self.skipWaiting();
  }
});

// Notifications (se necessário no futuro)
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click received.');
  
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
});