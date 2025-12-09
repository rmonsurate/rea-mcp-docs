// Lightbox functionality for images
document.addEventListener('DOMContentLoaded', function() {
  // Create lightbox container
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = `
    <span class="lightbox-close">&times;</span>
    <img src="" alt="Full size diagram">
    <div class="lightbox-hint">Click anywhere or press ESC to close</div>
  `;
  document.body.appendChild(lightbox);

  const lightboxImg = lightbox.querySelector('img');
  const closeBtn = lightbox.querySelector('.lightbox-close');

  // Close lightbox function
  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Open lightbox function
  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || 'Full size image';
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // Add click handlers to all images in content
  document.querySelectorAll('.md-content img').forEach(img => {
    // Skip small images like icons
    if (img.width < 100 || img.classList.contains('no-lightbox')) return;

    img.style.cursor = 'zoom-in';
    img.title = 'Click to view full size';

    img.addEventListener('click', function(e) {
      e.preventDefault();
      openLightbox(this.src, this.alt);
    });
  });

  // Close on overlay click
  lightbox.addEventListener('click', function(e) {
    if (e.target === lightbox || e.target === closeBtn) {
      closeLightbox();
    }
  });

  // Close on ESC key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && lightbox.classList.contains('active')) {
      closeLightbox();
    }
  });

  // Also allow opening in new tab with middle click or ctrl+click
  document.querySelectorAll('.md-content img').forEach(img => {
    img.addEventListener('auxclick', function(e) {
      if (e.button === 1) { // Middle click
        window.open(this.src, '_blank');
      }
    });

    img.addEventListener('click', function(e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        window.open(this.src, '_blank');
      }
    });
  });
});
