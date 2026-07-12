"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Input, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { useCompanies, useCreateTask } from "@/lib/hooks";

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (taskId: string) => void;
}

export function CreateTaskModal({ open, onClose, onCreated }: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [companyId, setCompanyId] = useState("");
  const createTask = useCreateTask();
  const { data: companies = [] } = useCompanies();

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("normal");
    setCompanyId("");
    createTask.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const task = await createTask.mutateAsync({
      title,
      description,
      priority,
      company_id: companyId || undefined,
    });
    onCreated?.(task.id);
    handleClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="task-title" className="mb-1 block text-sm font-medium text-text">
            Title
          </label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Research MTI's top 5 semiconductor prospects"
            required
          />
        </div>
        <div>
          <label htmlFor="task-description" className="mb-1 block text-sm font-medium text-text">
            Description
          </label>
          <Textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should the agent do?"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-priority" className="mb-1 block text-sm font-medium text-text">
              Priority
            </label>
            <Select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </div>
          <div>
            <label htmlFor="task-company" className="mb-1 block text-sm font-medium text-text">
              Company (optional)
            </label>
            <Select id="task-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">None</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {createTask.isError && (
          <p className="text-sm text-danger">{(createTask.error as Error).message}</p>
        )}
        <Modal.Footer>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createTask.isPending || !title.trim()}>
            {createTask.isPending ? "Creating…" : "Create Task"}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
