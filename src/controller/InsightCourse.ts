export interface InsightCourse {
    dept: string;
    id: string;
    avg: number;
    instructor: string;
    title: string;
    pass: number;
    fail: number;
    audit: number;
    uuid: string;
    year: number;
}

export class InsightCourse implements InsightCourse {
    constructor (dept: string, id: string, avg: number,
                 instructor: string, title: string, pass: number,
                 fail: number, audit: number, uuid: string, year: number) {
        this.dept = dept;
        this.id = id;
        this.avg = avg;
        this.instructor = instructor;
        this.title = title;
        this.fail = fail;
        this.pass = pass;
        this.audit = audit;
        this.uuid = uuid;
        this.year = year;
    }
}
