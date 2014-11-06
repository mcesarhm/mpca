var fs = require('fs');
var exec = require('child_process').exec;
var db = require('./db');
var argv = require('optimist').argv;

var entidades = [];
var mapaDeEntidades = {};

var repositorioName = argv._[0] || 'siop';

var repositorioMap = { siop: 1, derby: 2, hadoop: 3, wildfly: 4, 'eclipse.platform.ui': 5, 'eclipse.jdt': 6, 'geronimo': 7, 'lucene': 8 }

var repositorio = repositorioMap[repositorioName];

var dir = './../../' + repositorioName + '-historage';

console.log(repositorioName, repositorio, dir);

var issueExtractor = {
	siop: function (comment) {
		var result = comment.match(/#(\d+)/g), i;
		if (!!result) {
			for (i = 0; i < result.length; i += 1) {
				result[i] = result[i].substring(1)
			}
		}
		return result;
	},
	derby: function (comment) {
		var result = comment.match(/derby-(\d+)/gi), i;
		if (!!result) {
			for (i = 0; i < result.length; i += 1) {
				result[i] = result[i].substring(6)
			}			
		}
		return result;
	},
	hadoop: function (comment) {
		var sufix = {hadoop: "0", mapreduce: "1", hdfs: "2", yarn: "3"};
		var result = comment.match(/(hadoop|mapreduce|hdfs|yarn)-(\d+)/gi), i;
		if (!!result) {
			for (i = 0; i < result.length; i += 1) {
				var arr = result[i].split('-')
				result[i] = arr[1] + sufix[arr[0]]
			}			
		}
		return result;
	},
	wildfly: function (comment) {
		var sufix = {wfly: "0", jbpapp: "1", jbqa: "2", as7: "3", jbas: "4"};
		var result = comment.match(/(wfly|jbpapp|jbqa|as7|jbas)-(\d+)/gi), i;
		if (!!result) {
			for (i = 0; i < result.length; i += 1) {
				var arr = result[i].split('-')
				result[i] = arr[1] + sufix[arr[0]]
			}			
		}
		return result;
	},
	'eclipse.platform.ui': function (comment) {
		var result = comment.match(/(bug|fix|fix for)\ +(\d+)/gi), i;
		if (!!result) {
			for (i = 0; i < result.length; i += 1) {
				var arr = result[i].split(' ')
				result[i] = arr[arr.length-1]
			}			
		}
		return result;
	},
	'eclipse.jdt': function (comment) {
		var result = comment.match(/(bug|fix|fix for)\ +(\d+)/gi), i;
		if (!result) {
			result = comment.match(/^(\d+)$/gi)
		}
		if (!!result) {
			for (i = 0; i < result.length; i += 1) {
				var arr = result[i].split(' ')
				result[i] = arr[arr.length-1]
			}			
		}
		return result;
	},
	geronimo: function (comment) {
		var result = comment.match(/geronimo-(\d+)/gi), i;
		if (!!result) {
			for (i = 0; i < result.length; i += 1) {
				result[i] = result[i].substring(9)
			}			
		}
		return result;
	},
	lucene: function (comment) {
		var sufix = {lucene: "0", solr: "1"};
		var result = comment.match(/(lucene|solr)-(\d+)/gi), i;
		if (!!result) {
			for (i = 0; i < result.length; i += 1) {
				var arr = result[i].split('-')
				result[i] = arr[1] + sufix[arr[0]]
			}			
		}
		return result;
	}
}

var commits = fs.readFileSync(dir + '/' + repositorioName + '.log.csv').toString().split('\n');

console.log('Excluindo commits_issues');
db.query('delete from commits_issues where commit in ' +
			'(select id from commits where repositorio = ' + repositorio + ')', 
	function (err, results) {
		if (err) { throw err; }
		console.log('Excluindo commits_entidades');
		db.query('delete from commits_entidades where commit in ' +
			'(select id from commits where repositorio = ' + repositorio + ')', 
			function (err, results) {
				if (err) { throw err; }
				console.log('Excluindo entidades');
				db.query('delete from entidades where repositorio = ' + repositorio, 
					function (err, results) {
						if (err) { throw err; }
						console.log('Excluindo commits');
						db.query('delete from commits where repositorio = ' + repositorio, 
							function (err, results) {
								if (err) { throw err; }
								console.log('Incluindo commits');
								nextCommit(0);
							}
						);
					}
				);
			}
		);
	}
);

function nextCommit (i) {
	if (i >= commits.length) {
		console.log('\nIncluindo entidades');
		proximaEntidade(0);
		return;
	}
	if (i % 100 === 0) {
		process.stdout.write('.');
	}
	var arr = commits[i].split('\t');
	arr[2] = arr[2].replace(' +0000', '');
	
	var commit = arr[0];
	var issues = issueExtractor[repositorioName](arr[3]);
	var sql = 'insert into commits(id,autor,data,comentario,repositorio) values (?,?,?,?,?)';

	arr[2] = arr[2].replace(/ [\+|-]\d\d\d\d/, '');
	arr[3] = arr[3].substring(0, 10000);
	arr[4] = repositorio

	db.query(sql, arr, function (err, result) {
		if (err) { console.log('--------------------->' + i); throw err; }
		var sql = '', values = [], j;
		if (!!issues) {
			issues = objectDeDup(issues);
			for (j = 0; j < issues.length; j += 1) {
				sql += 'insert into commits_issues(commit,issue) values (?,?);'
				values.push(commit);
				values.push(parseInt(issues[j]));
			}			
		}
		if (sql.length === 0) {
			coletaEntidades();
		} else {
			db.query(sql, values, function (err, result) {
				if (err) { throw err; }
				coletaEntidades();
			});			
		}
	});

	function coletaEntidades () {
		var cmd = 'git diff-tree --no-commit-id --name-only -r ' + commit;
		exec(cmd, {cwd:dir}, function (err, stdout, stderr) {
			var lines = stdout.split('\n'), j;
			var line;
			for (j = 0; j < lines.length; j += 1) {
				line = lines[j].trim();
				if (line.indexOf('.f/') !== -1) {
					if (!mapaDeEntidades[line]) {
						entidades.push(line);
						mapaDeEntidades[line] = [];
					}
					mapaDeEntidades[line].push(commit);
				}
			}
			nextCommit(i + 1);
		});
	}

}

function proximaEntidade (i) {
	if (i >= entidades.length) {
		db.end();
		console.log('ok');
		return;
	}
	if (i % 100 === 0) {
		process.stdout.write('.');
	}
	var sql = 'insert into entidades(caminho,tipo,repositorio) values (?,?,?)'; 
	db.query(sql, [entidades[i],tipoEntidade(entidades[i]),repositorio], 
		function (err, result) {
			if (err) { throw err; }
			proximoCommitEntidade(result.insertId, mapaDeEntidades[entidades[i]], 0);
		}
	);

	function proximoCommitEntidade (entidadeId, commits, j) {
		if (j >= commits.length) {
			proximaEntidade(i+1);
			return;
		}
		var sql = 'insert into commits_entidades(commit, entidade) values (?, ?)'; 
		db.query(sql, [commits[j],entidadeId], function (err, result) {
			if (err) { throw err; }
			proximoCommitEntidade(entidadeId, commits, j+1);
		});
	}
}

function tipoEntidade (entidade) {
	var arr = entidade.split('/');
	if (arr.length < 2) return null;
	return arr[arr.length-2];
}

var objectDeDup = function(unordered) {
  var result = [];
  var object = {};
  unordered.forEach(function(item) {
    object[item] = null;
  });
  result = Object.keys(object);
  return result;
}