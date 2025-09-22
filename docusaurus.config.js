// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/** @type {import('@docusaurus/types').Config} */
const config = {
	title: 'Fox Box Insurance',
	tagline: "You'll forget about it. We won't.",
	favicon: 'img/favicon.ico',

	// Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
	future: {
		v4: true // Improve compatibility with the upcoming Docusaurus v4
	},

	// Set the production url of your site here
	url: 'https://docs.notfbi.dev',
	// Set the /<baseUrl>/ pathname under which your site is served
	// For GitHub pages deployment, it is often '/<projectName>/'
	baseUrl: '/',

	// GitHub pages deployment config.
	// If you aren't using GitHub pages, you don't need these.
	organizationName: 'MusicMakerOwO', // Usually your GitHub org/user name.
	projectName: 'FoxBoxInsurance', // Usually your repo name.

	onBrokenLinks: 'throw',
	onBrokenMarkdownLinks: 'warn',

	// Even if you don't use internationalization, you can use this field to set
	// useful metadata like html lang. For example, if your site is Chinese, you
	// may want to replace "en" with "zh-Hans".
	i18n: {
		defaultLocale: 'en',
		locales: ['en']
	},

	presets: [
		[
			'classic',
			/** @type {import('@docusaurus/preset-classic').Options} */
			({
				docs: {
					sidebarPath: './sidebars.js',
					// Please change this to your repo.
					// Remove this to remove the "edit this page" links.
					editUrl: 'https://github.com/MusicMakerOwO/FBI_Docs/tree/main/'
				},
				theme: {
					customCss: './src/css/custom.css',
				}
			})
		]
	],

	themeConfig:
		/** @type {import('@docusaurus/preset-classic').ThemeConfig} */
		({
			// Replace with your project's social card
			image: 'img/favicon.ico',
			navbar: {
				title: 'FBI',
				logo: {
					alt: 'FBI Logo',
					src: 'img/favicon.ico'
				},
				items: [
					{
						type: 'docSidebar',
						sidebarId: 'tutorialSidebar',
						position: 'left',
						label: 'Documentation'
					},
					{
						label: 'Discord',
						href: 'https://discord.gg/q7bUuVq4vB',
					},
					{
						href: 'https://github.com/MusicMakerOwO/FoxBoxInsurance',
						label: 'GitHub',
						position: 'right'
					}
				]
			},
			footer: {
				style: 'dark',
				links: [
					{
						title: 'Docs',
						items: [
							{
								label: 'Intro',
								to: '/docs/intro'
							},
							{
								label: 'Contributing',
								to: '/docs/category/contributing'
							},
							{
								label: 'API Reference',
								to: '/docs/category/api-reference'
							},
							{
								label: 'Algorithms',
								to: '/docs/category/contributing'
							},
							{
								label: 'Data Structures',
								to: '/docs/category/contributing'
							}
						]
					},
					{
						title: 'Community',
						items: [
							{
								label: 'Discord',
								href: 'https://discord.gg/q7bUuVq4vB'
							},
							{
								label: 'Email',
								href: 'mailto:support@notfbi.dev'
							}
						],
					},
					{
						title: 'More',
						items: [
							{
								label: 'GitHub',
								href: 'https://github.com/MusicMakerOwO/FoxBoxInsurance'
							},
							{
								label: 'Terms of Service',
								to: 'https://notfbi.dev/terms'
							},
							{
								label: 'Privacy Policy',
								to: 'https://notfbi.dev/privacy'
							}
						]
					}
				],
				copyright: `Copyright © ${new Date().getFullYear()} FoxTech Industries - Built with Docusaurus ❤️`
			},
			prism: {
				theme: prismThemes.dracula,
				darkTheme: prismThemes.dracula
			},
			colorMode: {
				defaultMode: 'dark',
				disableSwitch: false,
				respectPrefersColorScheme: false,
			}
		}),
};

export default config;