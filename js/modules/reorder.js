import { state, el, saveAppState } from './state.js';
import { renderTracksList } from './renderer.js';

let draggedCard = null;
let dragDirection = 'down';
let lastY = 0;
let touchOffsetY = 0;
let draggedCardHeight = 0;
let lastSwapTime = 0;

// FLIP animation helper for smooth reordering transitions
export function flipReorder(actionFn) {
  const list = el.tracksList;
  if (!list) {
    actionFn();
    return;
  }

  const cards = [...list.querySelectorAll('.track-card')];

  // First: Capture initial offsetTop positions relative to container parent
  const startTops = new Map(
    cards.map(card => [card.id, card.offsetTop])
  );

  // Perform layout modifications (state re-render or DOM shifts)
  actionFn();

  // Last: Capture post-layout positions and apply inverted transforms
  const newCards = [...list.querySelectorAll('.track-card')];
  newCards.forEach(card => {
    const startTop = startTops.get(card.id);
    if (startTop === undefined) return;

    const endTop = card.offsetTop;
    const deltaY = startTop - endTop;

    if (deltaY !== 0) {
      // Invert: shift back immediately with no transition
      card.style.transition = 'none';
      card.style.transform = `translateY(${deltaY}px)`;

      // Force repaint to make transform register before transition is enabled
      card.offsetHeight;

      // Play: animate back to final layout position
      card.style.transition = 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)';
      card.style.transform = '';
    }
  });

  // Cleanup inline transition styles after transition finishes
  if (list.cleanupTimeout) clearTimeout(list.cleanupTimeout);
  list.cleanupTimeout = setTimeout(() => {
    newCards.forEach(card => {
      card.style.transition = '';
      card.style.transform = '';
    });
  }, 150);
}

// Reorder tracks by index offset
export function moveTrack(trackId, direction) {
  const index = state.tracks.findIndex(t => t.id === trackId);
  if (index === -1) return;

  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.tracks.length) return;

  // Swap tracks in state
  const temp = state.tracks[index];
  state.tracks[index] = state.tracks[newIndex];
  state.tracks[newIndex] = temp;

  // Animate the swap re-render
  flipReorder(() => {
    renderTracksList();
  });

  saveAppState();
}

// Initialize dragover on track list container
export function initDragAndDrop() {
  const list = el.tracksList;
  if (!list) return;

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedCard) return;

    // Determine drag direction
    if (e.clientY > lastY) {
      dragDirection = 'down';
    } else if (e.clientY < lastY) {
      dragDirection = 'up';
    }
    lastY = e.clientY;

    const afterElement = getDragAfterElement(list, e.clientY, dragDirection);

    // Only trigger insertion if position actually changes in the DOM
    const currentNext = draggedCard.nextElementSibling;
    if (afterElement !== draggedCard && afterElement !== currentNext) {
      flipReorder(() => {
        if (afterElement == null) {
          list.appendChild(draggedCard);
        } else {
          list.insertBefore(draggedCard, afterElement);
        }
      });
    }
  });
}

// Bind drag listeners to each card
export function bindDragAndDropListeners(card) {
  // Only trigger dragging if user starts drag on the drag handle
  const handle = card.querySelector('.track-drag-handle');
  if (handle) {
    handle.addEventListener('mousedown', () => {
      card.setAttribute('draggable', 'true');
    });
    handle.addEventListener('mouseup', () => {
      card.removeAttribute('draggable');
    });
    handle.addEventListener('dragend', () => {
      card.removeAttribute('draggable');
    });
  }

  card.addEventListener('dragstart', (e) => {
    draggedCard = card;
    dragDirection = 'down'; // Reset to default on start
    lastY = e.clientY;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.id);
  });

  card.addEventListener('dragend', () => {
    draggedCard = null;
    card.classList.remove('dragging');
    card.removeAttribute('draggable');
    reorderStateFromDOM();
  });

  // Mobile touch drag-and-drop support: press-and-hold anywhere in the cell
  let touchTimeout = null;
  let isDraggingStarted = false;
  let startX = 0;
  let startY = 0;

  card.addEventListener('touchstart', (e) => {
    // Exclude interactive elements to let checkbox, play preview, and select alternatives work
    if (e.target.closest('button, select, input, label, .btn-play-preview')) {
      return;
    }

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    isDraggingStarted = false;

    if (touchTimeout) clearTimeout(touchTimeout);

    // Start a timer for short press (e.g. 250ms) to dim the cell and start drag
    touchTimeout = setTimeout(() => {
      isDraggingStarted = true;
      card.classList.add('dragging');
      draggedCard = card;
      dragDirection = 'down';
      lastY = startY;

      // Lock container and body scrolling to prevent touchcancel during drag
      const list = el.tracksList;
      if (list) {
        list.style.overflow = 'hidden';
      }
      document.body.style.overflow = 'hidden';

      // Capture the relative touch Offset Y and height of the card at the moment drag starts
      const rect = card.getBoundingClientRect();
      touchOffsetY = startY - rect.top;
      draggedCardHeight = rect.height;
      lastSwapTime = 0; // reset swap throttle time

      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    }, 250);
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];

    if (!isDraggingStarted) {
      // If we haven't started dragging yet, check if the finger has moved enough to scroll
      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);
      if (deltaX > 10 || deltaY > 10) {
        // User is scrolling, cancel the drag-start timer
        if (touchTimeout) {
          clearTimeout(touchTimeout);
          touchTimeout = null;
        }
      }
      return;
    }

    // If drag is active, prevent default scrolling
    e.preventDefault();
    if (draggedCard !== card) return;

    const clientY = touch.clientY;

    if (clientY > lastY) {
      dragDirection = 'down';
    } else if (clientY < lastY) {
      dragDirection = 'up';
    }
    lastY = clientY;

    // Apply throttle of 60ms to let transitions complete and avoid stutter
    const now = Date.now();
    if (now - lastSwapTime < 60) {
      return;
    }

    // Calculate the Y coordinate of the center of the dragged card
    const dragCardCenterY = clientY - touchOffsetY + (draggedCardHeight / 2);

    const list = el.tracksList;
    const afterElement = getDragAfterElement(list, dragCardCenterY, dragDirection);

    const currentNext = draggedCard.nextElementSibling;
    if (afterElement !== draggedCard && afterElement !== currentNext) {
      lastSwapTime = now;
      flipReorder(() => {
        if (afterElement == null) {
          list.appendChild(draggedCard);
        } else {
          list.insertBefore(draggedCard, afterElement);
        }
      });
    }
  }, { passive: false });

  const touchEndCancelHandler = (e) => {
    let wasTap = false;
    if (touchTimeout) {
      clearTimeout(touchTimeout);
      touchTimeout = null;
      wasTap = true;
    }

    // Unlock container and body scrolling
    const list = el.tracksList;
    if (list) {
      list.style.overflow = '';
    }
    document.body.style.overflow = '';

    if (isDraggingStarted) {
      card.classList.remove('dragging');
      if (draggedCard === card) {
        draggedCard = null;
        reorderStateFromDOM();
      }
    } else if (wasTap && e.type === 'touchend') {
      const isMobile = window.innerWidth <= 640;
      if (isMobile) {
        const trackId = parseInt(card.id.replace('track-card-', ''));
        const track = state.tracks.find(t => t.id === trackId);
        if (track && track.status !== 'no-match') {
          track.approved = !track.approved;
          if (track.approved) {
            card.classList.add('approved');
          } else {
            card.classList.remove('approved');
          }
          const checkbox = card.querySelector('.track-checkbox');
          if (checkbox) {
            checkbox.checked = track.approved;
          }
          updateCreatePlaylistButtonState();
          saveAppState();
        }
      }
    }
    isDraggingStarted = false;
  };

  card.addEventListener('touchend', touchEndCancelHandler);
  card.addEventListener('touchcancel', touchEndCancelHandler);
}

// Find closest dropsite card below drag pointer
export function getDragAfterElement(container, y, direction) {
  const draggableElements = [...container.querySelectorAll('.track-card:not(.dragging)')];
  const containerBox = container.getBoundingClientRect();
  const scrollTop = container.scrollTop;

  const isMobile = window.innerWidth <= 640;
  const thresholdRatio = isMobile ? (direction === 'down' ? 0.25 : 0.75) : (direction === 'down' ? -1 : 1);

  return draggableElements.reduce((closest, child) => {
    // Calculate layout top relative to the viewport, ignoring active transforms
    const layoutTop = containerBox.top + child.offsetTop - scrollTop;
    const height = child.offsetHeight;
    const offset = y - layoutTop - height * thresholdRatio;

    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Synchronize state array with current DOM elements order
export function reorderStateFromDOM() {
  const cards = [...el.tracksList.querySelectorAll('.track-card')];
  const newTracks = [];

  cards.forEach((card) => {
    const trackId = parseInt(card.id.replace('track-card-', ''));
    const track = state.tracks.find(t => t.id === trackId);
    if (track) {
      newTracks.push(track);
    }
  });

  state.tracks = newTracks;
  saveAppState();

  // Re-render to refresh indices and button disabled states
  renderTracksList();
}
