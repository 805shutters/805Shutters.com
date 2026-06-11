"use client";

import { useState, type CSSProperties } from "react";

type PortfolioCategoryId = "blinds" | "shades" | "drapery" | "shutters" | "exterior";

type PortfolioPhoto = {
  title: string;
  image: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  mobileImage?: string;
  mobileImageWidth?: number;
  mobileImageHeight?: number;
  video?: string;
  sourceLabel: "Installed portfolio" | "AI concept";
};

type PortfolioProduct = {
  id: string;
  label: string;
  photos: PortfolioPhoto[];
};

type PortfolioCategory = {
  id: PortfolioCategoryId;
  label: string;
  products: PortfolioProduct[];
};

type PortfolioPhotoStyle = CSSProperties & {
  "--portfolio-photo-aspect": string;
};

type PortfolioDropStyle = CSSProperties & {
  "--portfolio-column": number;
};

const aiConceptBase = {
  imageWidth: 1672,
  imageHeight: 941,
  sourceLabel: "AI concept" as const
};

const portfolioCategories: PortfolioCategory[] = [
  {
    id: "blinds",
    label: "Blinds",
    products: [
      {
        id: "faux-wood",
        label: "Faux Wood",
        photos: [
          {
            ...aiConceptBase,
            title: "Faux Wood Blind Concept",
            image: "/images/805-portfolio-blinds-office.jpg",
            imageAlt: "Faux wood blinds in a warm coastal office"
          }
        ]
      },
      {
        id: "premium-wood",
        label: "Premium Wood",
        photos: [
          {
            ...aiConceptBase,
            title: "Premium Wood Blind Concept",
            image: "/images/805-portfolio-blinds-office.jpg",
            imageAlt: "Premium wood blinds filtering light in a coastal office"
          }
        ]
      },
      {
        id: "vertical-blinds",
        label: "Vertical Blinds",
        photos: [
          {
            ...aiConceptBase,
            title: "Vertical Blind Patio Slider Concept",
            image: "/images/portfolio-ai/vertical-blinds-slider-concept.png",
            imageAlt: "Vertical blinds installed over a large patio sliding door"
          }
        ]
      },
      {
        id: "aluminum-blinds",
        label: "Aluminum Blinds",
        photos: [
          {
            ...aiConceptBase,
            title: "Aluminum Blind Kitchen Concept",
            image: "/images/portfolio-ai/aluminum-blinds-kitchen-concept.png",
            imageAlt: "Aluminum blinds installed across bright kitchen windows"
          }
        ]
      }
    ]
  },
  {
    id: "shades",
    label: "Shades",
    products: [
      {
        id: "roller-shades",
        label: "Roller Shades",
        photos: [
          {
            title: "Motorized Roller Shade Patio View",
            image: "/images/video-posters/motorized-roller-shades-patio-view.jpg",
            imageAlt: "Motorized roller shades installed over patio-view windows",
            imageWidth: 720,
            imageHeight: 1280,
            video: "/videos/motorized-roller-shades-patio-view-loop.m4v",
            sourceLabel: "Installed portfolio"
          },
          {
            title: "Large Window Roller Shade",
            image: "/images/portfolio-enhanced/roller-shade-large-window-card.jpg",
            imageAlt: "Roller shade covering a large Ventura County window",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/roller-shade-large-window-natural.jpg",
            mobileImageWidth: 1200,
            mobileImageHeight: 1600,
            sourceLabel: "Installed portfolio"
          }
        ]
      },
      {
        id: "honeycomb-shades",
        label: "Honeycomb Shades",
        photos: [
          {
            title: "Corner Honeycomb Shades",
            image: "/images/portfolio-enhanced/uploaded-corner-cellular-shades-card.jpg",
            imageAlt: "Honeycomb cellular shades installed on two corner windows",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/uploaded-corner-cellular-shades-natural.jpg",
            mobileImageWidth: 1600,
            mobileImageHeight: 1200,
            sourceLabel: "Installed portfolio"
          },
          {
            title: "Bedroom Honeycomb Shades",
            image: "/images/portfolio-enhanced/uploaded-bedroom-cellular-shades-card.jpg",
            imageAlt: "Honeycomb cellular shades installed on two bedroom windows beside a door",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/uploaded-bedroom-cellular-shades-natural.jpg",
            mobileImageWidth: 1600,
            mobileImageHeight: 1200,
            sourceLabel: "Installed portfolio"
          },
          {
            title: "Twin Honeycomb Shades",
            image: "/images/portfolio-enhanced/uploaded-twin-cellular-shades-card.jpg",
            imageAlt: "Twin honeycomb cellular shades installed on side-by-side bedroom windows",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/uploaded-twin-cellular-shades-natural.jpg",
            mobileImageWidth: 1600,
            mobileImageHeight: 1200,
            sourceLabel: "Installed portfolio"
          },
          {
            title: "Full-Height Honeycomb Shades",
            image: "/images/portfolio-enhanced/uploaded-full-height-cellular-shades-card.jpg",
            imageAlt: "Full-height honeycomb cellular shades installed on corner room windows",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/uploaded-full-height-cellular-shades-natural.jpg",
            mobileImageWidth: 1600,
            mobileImageHeight: 1200,
            sourceLabel: "Installed portfolio"
          }
        ]
      },
      {
        id: "layered-shades",
        label: "Layered Shades",
        photos: [
          {
            title: "Layered Bedroom Shades",
            image: "/images/portfolio-enhanced/layered-shades-bedroom-window-card.jpg",
            imageAlt: "Layered window shades installed on a bedroom window",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/layered-shades-bedroom-window-natural.jpg",
            mobileImageWidth: 1200,
            mobileImageHeight: 1600,
            sourceLabel: "Installed portfolio"
          }
        ]
      },
      {
        id: "roman-shades",
        label: "Roman Shades",
        photos: [
          {
            ...aiConceptBase,
            title: "Roman Shade Breakfast Nook Concept",
            image: "/images/portfolio-ai/roman-shades-breakfast-nook-concept.png",
            imageAlt: "Roman shades installed across breakfast nook windows"
          }
        ]
      },
      {
        id: "natural-shades",
        label: "Natural Shades",
        photos: [
          {
            ...aiConceptBase,
            title: "Natural Woven Shade Concept",
            image: "/images/editorial-scroll/breakfast-room-woven-shades.jpg",
            imageAlt: "Natural woven shades in a warm breakfast room"
          },
          {
            imageWidth: 1798,
            imageHeight: 875,
            sourceLabel: "AI concept",
            title: "Garden Living Natural Shade Concept",
            image: "/images/editorial-scroll/garden-living-woven-shades.jpg",
            imageAlt: "Natural woven shades with linen drapery in a garden living room"
          }
        ]
      },
      {
        id: "bamboo-shades",
        label: "Bamboo Shades",
        photos: [
          {
            ...aiConceptBase,
            title: "Bamboo Woven Shade Concept",
            image: "/images/editorial-scroll/breakfast-room-woven-shades.jpg",
            imageAlt: "Bamboo-style woven shades in a breakfast room"
          }
        ]
      },
      {
        id: "sheer-shades",
        label: "Sheer Shades",
        photos: [
          {
            ...aiConceptBase,
            title: "Sheer Shade Dining Room Concept",
            image: "/images/portfolio-ai/sheer-shades-dining-room-concept.png",
            imageAlt: "Sheer shades filtering daylight across dining room windows"
          }
        ]
      }
    ]
  },
  {
    id: "drapery",
    label: "Drapery",
    products: [
      "Ripplefold Drapery",
      "Pinch Pleat Drapery",
      "French Pleat Drapery",
      "Grommet Drapery",
      "Rod Pocket Drapery",
      "Goblet Pleat Drapery",
      "Inverted Box Pleat Drapery"
    ].map((label) => ({
      id: label.toLowerCase().replaceAll(" ", "-"),
      label,
      photos: [
        {
          ...aiConceptBase,
          title: `${label} Concept`,
          image: "/images/805-portfolio-drapery-living-room.jpg",
          imageAlt: `${label} in a warm coastal living room`
        },
        {
          imageWidth: 1761,
          imageHeight: 893,
          sourceLabel: "AI concept",
          title: "Layered Drapery Bedroom Concept",
          image: "/images/editorial-scroll/poolside-bedroom-roller-shades.jpg",
          imageAlt: "Layered white drapery and roller shades in a poolside bedroom"
        }
      ]
    }))
  },
  {
    id: "shutters",
    label: "Shutters",
    products: [
      {
        id: "premium-stained-wood",
        label: "Premium Stained Wood",
        photos: [
          {
            title: "Dark Wood Plantation Shutters",
            image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-reading-room-card.jpg",
            imageAlt: "Dark stained wood plantation shutters in a reading room",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/dark-wood-plantation-shutters-reading-room-natural.jpg",
            mobileImageWidth: 1200,
            mobileImageHeight: 1600,
            sourceLabel: "Installed portfolio"
          },
          {
            title: "Dark Wood Living Room Shutters",
            image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-card.jpg",
            imageAlt: "Dark stained wood plantation shutters in a living room",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-natural.jpg",
            mobileImageWidth: 1200,
            mobileImageHeight: 1600,
            sourceLabel: "Installed portfolio"
          }
        ]
      },
      {
        id: "painted-wood",
        label: "Painted Wood",
        photos: [
          {
            title: "Office Painted Wood Shutters",
            image: "/images/portfolio-enhanced/uploaded-office-plantation-shutters-card.jpg",
            imageAlt: "White painted wood shutters installed over office corner windows",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/uploaded-office-plantation-shutters-natural.jpg",
            mobileImageWidth: 1600,
            mobileImageHeight: 1200,
            sourceLabel: "Installed portfolio"
          },
          {
            title: "Dining Room Painted Shutters",
            image: "/images/portfolio-enhanced/plantation-shutters-dining-room-card.jpg",
            imageAlt: "White plantation shutters installed in a dining room",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/plantation-shutters-dining-room-natural.jpg",
            mobileImageWidth: 1200,
            mobileImageHeight: 1600,
            sourceLabel: "Installed portfolio"
          }
        ]
      },
      {
        id: "poly-composite",
        label: "Poly Composite",
        photos: [
          {
            title: "Bedroom Sliding Door Shutters",
            image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-card.jpg",
            imageAlt: "Composite-style shutters installed on a bedroom sliding door",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-natural.jpg",
            mobileImageWidth: 1600,
            mobileImageHeight: 1200,
            sourceLabel: "Installed portfolio"
          },
          {
            title: "Shutter Panel Detail",
            image: "/images/portfolio-enhanced/uploaded-shutter-panel-detail-card.jpg",
            imageAlt: "Close detail of a composite-style shutter panel beside a door",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/uploaded-shutter-panel-detail-natural.jpg",
            mobileImageWidth: 1600,
            mobileImageHeight: 2133,
            sourceLabel: "Installed portfolio"
          }
        ]
      },
      {
        id: "mdf-composite",
        label: "MDF Composite",
        photos: [
          {
            title: "Arched Window Shutters",
            image: "/images/portfolio-enhanced/arched-window-custom-shutters-card.jpg",
            imageAlt: "Composite-style arched plantation shutters in a living room",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/arched-window-custom-shutters-natural.jpg",
            mobileImageWidth: 1200,
            mobileImageHeight: 1600,
            sourceLabel: "Installed portfolio"
          },
          {
            title: "Stacked Arch Shutters",
            image: "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-card.jpg",
            imageAlt: "Stacked arched and rectangular shutters on tall living room windows",
            imageWidth: 900,
            imageHeight: 1125,
            mobileImage: "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-natural.jpg",
            mobileImageWidth: 1600,
            mobileImageHeight: 1200,
            sourceLabel: "Installed portfolio"
          }
        ]
      }
    ]
  },
  {
    id: "exterior",
    label: "Exterior Shades",
    products: [
      {
        id: "motorized-patio",
        label: "Motorized Patio",
        photos: [
          {
            title: "Motorized Patio Shade Concept",
            image: "/images/editorial-scroll/sunset-patio-exterior-shades.jpg",
            imageAlt: "Motorized patio exterior shades filtering sunset light",
            imageWidth: 1672,
            imageHeight: 941,
            sourceLabel: "AI concept"
          },
          {
            title: "Ocean Terrace Exterior Shade Concept",
            image: "/images/editorial-scroll/ocean-terrace-exterior-shades.jpg",
            imageAlt: "Exterior patio shades over a bright ocean terrace",
            imageWidth: 1806,
            imageHeight: 871,
            sourceLabel: "AI concept"
          }
        ]
      },
      {
        id: "non-motorized-patio",
        label: "Non-Motorized Patio",
        photos: [
          {
            title: "Coastal Patio Exterior Shade Concept",
            image: "/images/editorial-scroll/ocean-terrace-exterior-shades.jpg",
            imageAlt: "Manual exterior patio shades over a bright coastal terrace",
            imageWidth: 1806,
            imageHeight: 871,
            sourceLabel: "AI concept"
          }
        ]
      }
    ]
  }
];

function productSelection(productId: string) {
  for (const category of portfolioCategories) {
    const product = category.products.find((item) => item.id === productId);

    if (product) {
      return { category, product };
    }
  }

  return {
    category: portfolioCategories[0],
    product: portfolioCategories[0].products[0]
  };
}

function portfolioPhotoAspect(photo: PortfolioPhoto): PortfolioPhotoStyle {
  const width = photo.mobileImageWidth || photo.imageWidth;
  const height = photo.mobileImageHeight || photo.imageHeight;

  return {
    "--portfolio-photo-aspect": `${width} / ${height}`
  };
}

export function PortfolioBrowser() {
  const [activeCategoryId, setActiveCategoryId] = useState<PortfolioCategoryId>("blinds");
  const [selectedProductId, setSelectedProductId] = useState("faux-wood");
  const activeCategory = portfolioCategories.find((category) => category.id === activeCategoryId) || portfolioCategories[0];
  const activeCategoryIndex = portfolioCategories.findIndex((category) => category.id === activeCategory.id);
  const { category: selectedCategory, product: selectedProduct } = productSelection(selectedProductId);
  const dropStyle: PortfolioDropStyle = {
    "--portfolio-column": activeCategoryIndex + 1
  };

  return (
    <section className="portfolio-browser" id="portfolio" aria-label="Window covering portfolio">
      <div className="portfolio-browser-menu">
        <div className="portfolio-category-row" aria-label="Portfolio categories">
          {portfolioCategories.map((category) => (
            <button
              aria-expanded={category.id === activeCategory.id}
              className={`portfolio-category-button${category.id === activeCategory.id ? " active" : ""}`}
              key={category.id}
              onClick={() => setActiveCategoryId(category.id)}
              onFocus={() => setActiveCategoryId(category.id)}
              onMouseEnter={() => setActiveCategoryId(category.id)}
              type="button"
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="portfolio-product-drop" style={dropStyle}>
          <div className="portfolio-product-list" key={activeCategory.id}>
            {activeCategory.products.map((product) => (
              <button
                className={`portfolio-product-button${product.id === selectedProduct.id ? " active" : ""}`}
                key={product.id}
                onClick={() => setSelectedProductId(product.id)}
                type="button"
              >
                {product.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="content-wrap portfolio-browser-selection">
        <div>
          <p>{selectedCategory.label}</p>
          <h2>{selectedProduct.label}</h2>
        </div>
      </div>

      <div className="content-wrap portfolio-browser-grid" aria-live="polite">
        {selectedProduct.photos.map((photo) => (
          <figure className="portfolio-browser-card" key={`${selectedProduct.id}-${photo.title}`} style={portfolioPhotoAspect(photo)}>
            {photo.video ? (
              <video
                aria-label={photo.imageAlt}
                autoPlay
                loop
                muted
                playsInline
                poster={photo.image}
                preload="auto"
                width={photo.imageWidth}
                height={photo.imageHeight}
              >
                <source src={photo.video} type="video/mp4" />
              </video>
            ) : (
              <picture>
                {photo.mobileImage ? <source media="(max-width: 620px)" srcSet={photo.mobileImage} /> : null}
                <img
                  src={photo.image}
                  alt={photo.imageAlt}
                  width={photo.imageWidth}
                  height={photo.imageHeight}
                  loading="lazy"
                  decoding="async"
                />
              </picture>
            )}
            <figcaption>
              <span>{photo.sourceLabel}</span>
              <strong>{photo.title}</strong>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
