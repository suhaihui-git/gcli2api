<template>
  <div class="page-shell flex min-h-screen items-center justify-center px-4">
    <div class="panel-shell max-w-lg text-center">
      <p class="text-xs uppercase tracking-[0.3em] app-text-muted">404</p>
      <h1 class="mt-4 text-3xl font-semibold app-text-strong">页面不存在</h1>
      <p class="mt-4 text-sm leading-7 app-text-muted">
        当前地址没有对应的控制台页面，请从导航返回。
      </p>
      <router-link
        class="app-quick-link app-quick-link--secondary mt-6 inline-flex items-center justify-center"
        :to="{ name: 'dashboard' }"
      >
        返回概览页
      </router-link>
    </div>
  </div>
</template>
