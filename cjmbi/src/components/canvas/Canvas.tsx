import { useCallback, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
  useDraggable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore, useWidgets, useUIState } from '@/core/state/store';
import { WidgetRenderer } from './WidgetRenderer';
import { Icon } from '@/components/common/Icon';
import type { WidgetSpec } from '@/types';

const GRID_COLUMNS = 24;
const GRID_ROW_HEIGHT = 40;

export function Canvas() {
  const widgets = useWidgets();
  const { mode, selectedWidgetId, zoom } = useUIState();
  const { selectWidget, updateWidgetPosition } = useAppStore();
  const showGrid = useAppStore((state) => state.project.settings.showGrid);
  const canvasRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    selectWidget(event.active.id as string);
  }, [selectWidget]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      const widget = widgets.find((w) => w.id === active.id);
      
      if (widget && canvasRef.current) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const cellWidth = canvasRect.width / GRID_COLUMNS;
        
        const deltaX = Math.round(delta.x / cellWidth);
        const deltaY = Math.round(delta.y / GRID_ROW_HEIGHT);
        
        const newX = Math.max(0, Math.min(GRID_COLUMNS - widget.position.width, widget.position.x + deltaX));
        const newY = Math.max(0, widget.position.y + deltaY);
        
        updateWidgetPosition(widget.id, {
          ...widget.position,
          x: newX,
          y: newY,
        });
      }
    },
    [widgets, updateWidgetPosition]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        selectWidget(null);
      }
    },
    [selectWidget]
  );

  // Calculate canvas height based on widgets
  const maxY = widgets.reduce((max, w) => Math.max(max, w.position.y + w.position.height), 0);
  const canvasHeight = Math.max(600, (maxY + 4) * GRID_ROW_HEIGHT);

  return (
    <div className="flex-1 bg-surface-100 overflow-auto p-6">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={canvasRef}
          className={`relative bg-white rounded-lg shadow-sm border border-surface-200 mx-auto transition-transform ${
            showGrid && mode === 'design' ? 'grid-overlay' : ''
          }`}
          style={{
            width: '100%',
            maxWidth: '1400px',
            minHeight: canvasHeight,
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
          onClick={handleCanvasClick}
        >
          {widgets.length === 0 ? (
            <EmptyCanvas />
          ) : (
            widgets.map((widget) => (
              <WidgetContainer
                key={widget.id}
                widget={widget}
                isSelected={selectedWidgetId === widget.id}
                isDesignMode={mode === 'design'}
                gridRowHeight={GRID_ROW_HEIGHT}
                gridColumns={GRID_COLUMNS}
                canvasRef={canvasRef}
              />
            ))
          )}
        </div>
      </DndContext>
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <Icon name="layoutGrid" size={48} className="mx-auto mb-4 text-surface-300" />
        <h3 className="text-lg font-medium text-surface-600 mb-2">
          Start Building Your Dashboard
        </h3>
        <p className="text-sm text-surface-500 max-w-md">
          Drag widgets from the left panel or click on them to add to the canvas.
          Connect a data source to visualize your data.
        </p>
      </div>
    </div>
  );
}

interface WidgetContainerProps {
  widget: WidgetSpec;
  isSelected: boolean;
  isDesignMode: boolean;
  gridRowHeight: number;
  gridColumns: number;
  canvasRef: React.RefObject<HTMLDivElement>;
}

function WidgetContainer({
  widget,
  isSelected,
  isDesignMode,
  gridRowHeight,
  gridColumns,
  canvasRef,
}: WidgetContainerProps) {
  const { selectWidget, updateWidgetPosition } = useAppStore();
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: widget.id,
    disabled: !isDesignMode || isResizing,
  });

  const style = {
    position: 'absolute' as const,
    left: `${(widget.position.x / gridColumns) * 100}%`,
    top: widget.position.y * gridRowHeight,
    width: `${(widget.position.width / gridColumns) * 100}%`,
    height: widget.position.height * gridRowHeight,
    padding: '4px',
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 1000 : isSelected ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: widget.position.width,
      height: widget.position.height,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeStartRef.current || !canvasRef.current) return;
      
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const cellWidth = canvasRect.width / gridColumns;
      
      const deltaX = moveEvent.clientX - resizeStartRef.current.x;
      const deltaY = moveEvent.clientY - resizeStartRef.current.y;
      
      const deltaWidthCells = Math.round(deltaX / cellWidth);
      const deltaHeightCells = Math.round(deltaY / gridRowHeight);
      
      const newWidth = Math.max(1, Math.min(gridColumns - widget.position.x, resizeStartRef.current.width + deltaWidthCells));
      const newHeight = Math.max(1, resizeStartRef.current.height + deltaHeightCells);
      
      updateWidgetPosition(widget.id, {
        ...widget.position,
        width: newWidth,
        height: newHeight,
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [widget.id, widget.position, gridColumns, gridRowHeight, canvasRef, updateWidgetPosition]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        selectWidget(widget.id);
      }}
      {...(isDesignMode && !isResizing ? { ...attributes, ...listeners } : {})}
    >
      <div
        className={`h-full rounded-lg border bg-white overflow-hidden transition-shadow ${
          isSelected
            ? 'border-mosaic-500 ring-2 ring-mosaic-200 shadow-lg'
            : 'border-surface-200 hover:border-surface-300 shadow-sm'
        } ${isDesignMode && !isResizing ? 'cursor-move' : ''} ${isDragging ? 'shadow-2xl' : ''}`}
      >
        {/* Widget Header */}
        {widget.title && (
          <div className="px-3 py-2 border-b border-surface-100 bg-surface-50">
            <h4 className="text-xs font-medium text-surface-700 truncate">
              {widget.title}
            </h4>
          </div>
        )}
        
        {/* Widget Content */}
        <div className="p-2 h-[calc(100%-2rem)]">
          <WidgetRenderer widget={widget} />
        </div>

        {/* Resize Handle (design mode only) */}
        {isDesignMode && isSelected && (
          <div 
            className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center bg-mosaic-500 rounded-tl-md"
            onMouseDown={handleResizeStart}
          >
            <Icon
              name="grip"
              size={12}
              className="text-white"
            />
          </div>
        )}
      </div>
    </div>
  );
}
