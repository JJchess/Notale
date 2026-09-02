# Third-party notices

## Telescope Zoom source project

This candidate is a behavior-level adaptation of Joffrey Spitzer's `telescope-zoom` repository at commit `8a0e22d16bae84271a646e45e1a5e29a5f9c1328`:

<https://github.com/joffreysp/telescope-zoom>

The README claims MIT and points to a root `LICENSE` file. That file does not exist at the locked commit, and no license file was found in any of the repository's 16 commits. Therefore the upstream software license is unresolved. This candidate does not copy the upstream HTML, CSS, or JavaScript; it reimplements the measured behavior. This distinction reduces copied-code exposure but does not create or imply a license grant for the upstream project or its artistic composition.

The upstream credits the original Telescope concept to Louis Paquet, Adrien Vanderpotte, Kim Levan, and KOKI-KIKO. Those credits are preserved here as provenance, not as a claim that they licensed this adaptation.

## Photographs and mask

The upstream README collectively describes its images as “Free for Personal and Business use from Pexels,” but it supplies no individual Pexels URLs, photo IDs, photographer names, download records, or license snapshots. The image files contain no usable embedded creator or source metadata. Exact per-file provenance cannot be independently verified from the repository.

The current Pexels license, checked on 2026-08-30, permits free website use and modification without mandatory attribution. It prohibits selling unaltered copies, implying endorsement, using media as a mark, and redistribution on stock-photo or wallpaper platforms:

<https://www.pexels.com/license/>

This candidate uses the files inside one composed web cover and is not a stock or wallpaper service. Even so, the absent individual source records are a residual chain-of-title risk. `mask.png` also has no separate provenance statement; it appears to be a subject mask for `img-big.jpg`, but that relationship is not treated as a license fact. Promotion beyond review should wait for source IDs and author records, or replace the media with assets having an explicit redistribution trail.

Byte-identical redistributed files and SHA-256:

```text
3c7b79360cb02228a5dc5bef0d8df456ec4fdb45eae5642c00d269ef70e15602  img-1.webp
7b7044fb40c305d8c9f0e781fa3fb9f64fcf7989d062c121c18f2cc85450fba6  img-2.webp
d2ac87321e6f9df50923a4abd1c1cdef8c9d91639393eb6783ea6d9a2ed10e4d  img-3.webp
cf0068c9262cd2759296e6bc829e0a6774997402578bee9b7b444074314dc309  img-4.webp
89ab79b4371118ebe1653c1db47e9597d7ac4de445d0b9c95190266c20bc82e9  img-6.webp
4dcf5d62865e1689bed67d52601a439aff3d70b447c97cd0209fa899761fcc21  img-7.webp
2daf1983f8218bc9f0cfb17070f82e15f6c5cee6938e95e8ca097ee474c29cf3  img-8.webp
82650c52a75dbb3426ea6c0f322b40808b767f08d8a5834a8d345dd91e69cda0  img-9.webp
d0d0aff5415fa14e85ce14db72e755b59d48837037a6ce4929d7965d0b03fda7  img-10.webp
695bd9d541345cd678ed21042a816ee5a31dc26c1b66dffd9be2e8489948bdb6  img-big.jpg
19bf2a764980cbe0720895e2ab1bf6e9e34144cade8f33e089cf113fea97934a  mask.png
```

## GSAP 3.13.0

`pages/assets/gsap.min.js` is the unmodified GSAP 3.13.0 core distribution from npm. Copyright 2025 GreenSock. All rights reserved. The embedded proprietary notice and license URL remain intact.

GSAP is distributed under the Standard “No Charge” License, not MIT. The current terms permit use, reproduction, display, and implementation for websites, web applications, and digital interfaces. They prohibit use in visual animation builders that compete with Webflow, reverse engineering for that purpose, and removal of proprietary notices:

<https://gsap.com/standard-license/>

Only GSAP core is used here. ScrollSmoother and ScrollTrigger are not redistributed. SHA-256 of the bundled file:

```text
96c01b81f44a3290e2b4532f55e2c9534b2adc43273a19f3756b2cb41f0fd0b6  gsap.min.js
```

The cover sample itself is a permitted digital-interface use on the face of the current terms. If the sample is later embedded in a product that qualifies as a prohibited competing visual animation builder, the product owner must reassess or obtain permission.

## Adobe Fonts

The upstream loads `area-normal` from Adobe Typekit at runtime. No Adobe stylesheet or font binary is included in this candidate. The delivered title uses a system font stack, so there is no Adobe Fonts redistribution.

