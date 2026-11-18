// The generated augmentation, as `.figatellu/messages/types.ts` emits it for `runtime: 'use-intl'`.
export type TestMessages = {
  readonly content: {
    readonly blog: {
      readonly 'patch-notes': {
        readonly $: { readonly title: string };
        readonly bot: { readonly $: { readonly title: string } };
      };
    };
  };
  readonly home: {
    readonly posts: string;
    readonly greeting: string;
    readonly updated: string;
    readonly title: string;
  };
};

declare module '../types.js' {
  interface Register {
    readonly table: {
      readonly 'content.blog.patch-notes.$.title': undefined;
      readonly 'content.blog.patch-notes.bot.$.title': undefined;
      readonly 'home.posts': { readonly count: number };
      readonly 'home.greeting': { readonly gender: 'female' | (string & {}); readonly name: string | number };
      readonly 'home.updated': { readonly day: Date | number };
      readonly 'home.title': undefined;
    };
    readonly namespace:
      | 'content'
      | 'content.blog'
      | 'content.blog.patch-notes'
      | 'content.blog.patch-notes.$'
      | 'content.blog.patch-notes.bot'
      | 'content.blog.patch-notes.bot.$'
      | 'home';
    readonly messages: TestMessages;
    readonly locale: 'fr' | 'en';
  }
}

export const FR: TestMessages = {
  content: { blog: { 'patch-notes': { $: { title: 'Notes de version' }, bot: { $: { title: 'Bot' } } } } },
  home: {
    posts: '{count, plural, one {# billet} many {# billets} other {# billets}}',
    greeting: '{gender, select, female {Bienvenue} other {Bienvenu}} {name}',
    updated: 'Mis à jour le {day, date, long}',
    title: 'Accueil',
  },
};
